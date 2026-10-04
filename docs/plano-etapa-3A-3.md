# Etapa 3A.3 — demais telas e permissões efetivas

Preparação em 02/10/2026, base `e7a67b5`. Complementa o [plano 3A](./plano-etapa-3A.md) após painel/consulta concluídos. Esta entrega é documental: inspeção de código e contrato de implementação, sem nova prova dinâmica de API, banco ou interface. R19 permanece parcial.

## Diagnóstico por inspeção

| Área / fonte | Comportamento atual | Consequência para a implementação |
| --- | --- | --- |
| [Permissões efetivas](../apps/web/src/hooks/use-permissions.ts) | Chave `permissions/me/usuário`, frescor 30s, sem intervalo; administrador dispensa consulta. `can` usa dados em cache mesmo quando uma nova leitura falha | Unificar leitura e estado de autorização; frescor não agenda atualização. Administrador também precisa detectar sessão revogada |
| [Guard de rota](../apps/web/src/components/layout/protected-route.tsx) e [layout](../apps/web/src/components/layout/app-layout.tsx) | Ambos consomem permissões; erro no guard substitui os filhos, menu usa `can`. Painel/consulta têm leitores próprios na mesma chave | Não multiplicar temporizadores nem desmontar rascunhos em falha transitória. Harmonizar menu, rota, botões e leitores já entregues |
| [Sessão](../apps/web/src/hooks/use-auth.tsx) | `auth/me` na validação da sessão; expiração local e recuperação de erro existentes. Sem leitura periódica universal | Não chamar o fluxo de carregamento inicial a cada intervalo: ele pode desmontar toda a interface. Manter isolamento do cliente por sessão |
| [Financeiro](../apps/web/src/pages/financial/financial-page.tsx) | Lista com filtros, limite 200/offset 0; resumo separado, filtrado somente por datas; seletores próprios. Cartões usam `?? 0` sem estado próprio de falha | Leitura independente e timestamp por seção; ausência de resposta não pode significar saldo zero. Identificar escopo do resumo, sem mudar sua semântica para seguir todos os filtros |
| [Baixa/histórico](../apps/web/src/pages/financial/payment-dialog.tsx) | Histórico por lançamento; objeto `current`, versão, idempotência e tentativa incerta separados da lista | Atualizar histórico não pode trocar silenciosamente versão, pagamento ativo ou tentativa capturada. Distinguir estado observado de estado confirmado para a ação |
| [Pacientes](../apps/web/src/pages/patients/patients-page.tsx) | Lista busca/100; edição copia dados/versão. Exclusão guarda prévia/version/fingerprint de exames; assinatura do cache observa invalidação local de exames | Polling não equivale a invalidação de outro computador. Jamais renovar prévia ou fingerprint silenciosamente; preservar rejeição do servidor para conjunto alterado |
| [Dentistas](../apps/web/src/pages/dentists/dentists-page.tsx) | Lista busca/100, especialidades em chave de formulário, horários e revisão de disponibilidade próprios | Não substituir horários digitados nem recalcular revisão. Manter regra de bloquear redução/inativação que afete consultas futuras |
| [Procedimentos](../apps/web/src/pages/procedures/procedures-page.tsx) / [especialidades](../apps/web/src/pages/specialties/specialties-page.tsx) | Listas busca/100; edição e exclusão versionadas | Atualizar lista sem mudar duração/preço digitados ou alvo/versão de confirmação |
| [Usuários](../apps/web/src/pages/users/users-page.tsx) | Lista com busca, seletor de dentistas; tratamento explícito de perda de acesso, senha e revisão de versão | Preservar limpeza de senhas e conflitos; atualização não deve repor credencial digitada ou promover autoridade local |
| [Matrizes por perfil](../apps/web/src/pages/permissions/permissions-page.tsx) | Leitura `permissions/roles`; efeito só inicializa perfil ausente do rascunho. Recarga explícita substitui um perfil; 401/403 apagam rascunhos | Nova resposta não atualiza automaticamente rascunho já inicializado. Mostrar versão remota disponível e exigir revisão; manter independência entre perfis |
| [Exames](../apps/web/src/pages/patients/patient-exams-page.tsx) | Paciente, lista e política separados; upload e blob de prévia fora do cache da lista. Há geração para exclusão/prévia e revogação de URL | Troca de paciente/permissão precisa coordenar também upload, callbacks e blob. Atualizar lista não remove por si só imagem já aberta. Erro do cabeçalho hoje pode parecer paciente genérico |
| [Serviços](../apps/web/src/lib/services.ts) | Parte das listas aceita `AbortSignal`; financeiro, exames e vários cadastros ainda não recebem sinal. `listAll` faz múltiplas páginas | Propagar cancelamento nas leituras abrangidas, inclusive entre páginas. Não agendar `listAll` universalmente a cada 15s |

A política compartilhada está em [use-live-query](../apps/web/src/hooks/use-live-query.ts). `accessLost`/`missing` são estados do hook: componentes/chaves precisam ser delimitados por identidade e recurso para não levar negação de um alvo ao seguinte. Remover cache por prefixo também pode afetar referências de formulários e permissões de outros leitores; usar escopo preciso e testes de integração.

## Autorização e limites do contrato

Inspeção dos [endpoints de permissões](../apps/api/src/api/routers/permissions_router.py), [dependências de autenticação](../apps/api/src/api/deps/auth.py), [financeiro](../apps/api/src/api/routers/financial_router.py) e [exames](../apps/api/src/api/routers/exams_router.py):

- `permissions/me` exige sessão ativa e retorna perfil/versão/matriz também para administrador; não depende de uma permissão de recurso. Usar esse endpoint para revalidar acesso em todos os perfis, sem acrescentar outro GET periódico de identidade por padrão. Se o perfil retornado divergir da identidade validada, ocultar conteúdo e revalidar a sessão antes de usar a matriz.
- Matrizes administrativas exigem administrador. Lista/resumo/histórico financeiro exigem `financial.view`; estorno também exige `financial.update` e `financial_reversals.create`. Política/lista/download de exames exigem `exams.view`; cabeçalho do paciente usa outro recurso (`patients.view`). Negação do cabeçalho não deve ampliar acesso nem ser confundida com inexistência do paciente.
- Backend continua autorizando cada operação. Atualização visual reduz atraso de percepção; não substitui locks, versões, idempotência, CSRF ou validação da sessão no servidor. Nenhuma mudança dessas regras ou migração está prevista.

## Política comum

1. Leituras operacionais montadas: 15s visível/conectado, 60s após falha; retorno/reconexão/manual e última leitura bem-sucedida. Sem polling em aba oculta/offline, sem escrita automática. Medir latência real e quantidade de GETs por chave; não prometer 15s em rede lenta ou aba suspensa.
2. Primeira falha não significa lista vazia/valor zero. Falha transitória de dados preserva última leitura identificada; seções independentes podem ter timestamps diferentes. Alterar filtro não deve apresentar dados antigos como se fossem do filtro novo.
3. Falha de verificação de acesso é diferente: ocultar conteúdo sensível e impedir ações enquanto desconhecido, mantendo rascunho apenas em memória da sessão para recuperação autorizada. A barreira visual deve impedir foco/interação e exposição de conteúdo, não apenas colocar aviso sobre a página.
4. Revogação confirmada de leitura oculta dados, cancela leituras e limpa cache/rascunhos sensíveis do recurso. Revogação somente de escrita mantém leitura autorizada, bloqueia ação aberta e exige revisão explícita antes de eventual retomada; nunca enviar automaticamente após concessão. 401 segue encerramento global, inclusive administrador. Não restaurar dados de outra sessão.
5. Manter leitor de permissões fora da área bloqueada para recuperar verificação/concessão. Uma fonte de agendamento por sessão, consumidores sem temporizadores próprios; preservar chave compartilhada e remover leitores duplicados de painel/consulta de maneira coordenada.
6. Dados de exibição e snapshots de ações são diferentes. Leitura remota não atualiza versão do formulário, identidade da tentativa financeira, fingerprint ou confirmação de exclusão. Conflito/resultado incerto continua exigindo a revisão existente. Respostas tardias não repovoam outro paciente/filtro/sessão.
7. Referências de formulários: atualizar ao preparar uma nova ação ou por revisão explícita; enquanto houver rascunho, congelar opções usadas pela ação. Seletor de filtro pode atualizar separadamente, preservando valor escolhido. Registro indisponível deve ter indicação, nunca ser trocado pelo primeiro da lista.
8. Manter limites atuais e mostrar truncamento; paginação completa terá recorte próprio da etapa 3. Datas/fuso, acesso clínico, parcelamento/prontuário e instalação assistida não entram nesta correção. Não declarar R19 encerrado antes da matriz final de cobertura.

## Subetapas ordenadas

Cada linha é um recorte com implementação, testes apropriados, homologação, CI e publicação próprios. Se necessário, subdividir antes de começar; não juntar todos em uma entrega.

| Ordem | Escopo | Aceite específico |
| --- | --- | --- |
| **3A.3.1.1** | Leitor compartilhado de permissões efetivas | Uma fonte de agendamento, todos os perfis, cancelamento por sessão, falha/recuperação, revogação/concessão, sem corrida com painel/consulta; testes com vários consumidores simultâneos |
| **3A.3.1.2** | Integração de menu, guards e ações abertas | Menu/rota/botões coerentes; leitura revogada oculta/limpa, escrita revogada bloqueia ações; falha transitória conserva rascunho oculto e recuperação autorizada o restaura. Chrome com formulário aberto e administrador revogado; nenhuma senha persistida |
| **3A.3.2.1** | Lista e resumo financeiro | Filtros preservados, resumo por datas explicitado, erro não vira zero, estados independentes, limite 200 visível. Edição/geração/baixa abertas conservam snapshots |
| **3A.3.2.2** | Histórico financeiro e ações abertas | Baixa/estorno remotos aparecem sem trocar versão/payment_id/idempotency_key capturados; conflito e resultado incerto exigem revisão, sem reenvio automático. 404/403 sem histórico antigo exposto |
| **3A.3.3** | Pacientes | Atualização de lista/busca, edição intacta, exclusão remota e exames alterados não renovam confirmação; testar fingerprint antigo rejeitado e nova revisão explícita |
| **3A.3.4.1** | Procedimentos e especialidades | Listas e truncamento, versões preservadas, exclusão/inativação, falha/retorno; referências de agenda não alteram duração/fim digitados |
| **3A.3.4.2** | Dentistas | Lista e vínculos de especialidades, horário/rascunho/revisão preservados; bloqueio de consultas futuras afetadas continua válido |
| **3A.3.5.1** | Usuários | Lista atualizada, senha/edição/exclusão versionadas preservadas, perda de acesso limpa credenciais e dados; própria sessão revogada sem usuário antigo reaparecer |
| **3A.3.5.2** | Matrizes administrativas | Mostrar mudança remota sem substituir rascunhos de cada perfil; recarga explícita de um não apaga outro. Versão antiga continua rejeitada; perda de administração oculta matrizes |
| **3A.3.6** | Exames e cabeçalho do paciente | Upload/exclusão remotos, paciente ausente, permissões separadas, blob/URL revogados quando acesso/registro some; notas/arquivo preservados nas atualizações autorizadas. Troca de paciente cancela envio anterior e ignora callbacks antigos; cancelamento não presume rollback de upload |
| **3A.3.7** | Referências e cobertura cruzada | Agenda/calendário/financeiro/dentistas/usuários: seletor novo lê referências atuais, rascunho aberto não muda opções/valores. Auditoria final da matriz R19 e requisições, sem ampliar polling de listas completas |

O primeiro recorte deve definir a interface de estados de acesso usada no segundo. Não declarar revalidação universal concluída só por trocar `useQuery` no hook. Durante a transição, registrar quais telas já consomem o novo estado; o aceite de 3A.3.1 exige ambos os recortes e regressões de agenda/painel/consulta.

### Ajuste de integração — 02/10/2026

Ao iniciar 3A.3.1.1, a inspeção confirmou que ativar o novo agendamento na chave consumida pelo hook legado provocaria desmontagem de formulários nos guards atuais em falha transitória. Por isso, **3A.3.1.1 entrega a fundação testada, sem montar o provider no aplicativo**. O aceite desta fundação é componente/build/regressão/CI; Chrome/HTTP de ativação, atualização da homologação e preservação correspondente ficam na 3A.3.1.2, quando guards/menu/ações e leitores de painel/consulta serão migrados juntos. Não adicionar provider ao `App` isoladamente nem declarar permissões globais atualizadas após esta fundação.

O novo contrato expõe `status` (`anonymous`, `checking`, `verified`, `unavailable`, `denied`, `identity-mismatch`), matriz/versão apenas quando verificadas, conectividade, leitura em andamento, instante da leitura e ação manual. Consumidores só leem contexto. Perfil divergente não concede autoridade: a integração deverá revalidar identidade antes de aceitar a matriz. 401 continua responsabilidade do transporte global; o teste isolado do leitor não prova logout real.

## Verificação exigida em cada implementação

- **Componentes:** relógio controlado para intervalo/pausa/retorno, resposta lenta e sobreposição; falha inicial/parcial, 401/403/404 aplicáveis, troca de chave/sessão, rascunho/versão/confirmação estáveis. Com múltiplos consumidores, medir leituras efetivas, não só instâncias do hook.
- **HTTP:** usar scripts existentes para versões, fingerprint, idempotência e autorização; acrescentar só lacunas do recorte. Dois perfis/sessões quando necessário. Banco só recebe testes novos se houver mudança transacional; distinguir testes HTTP com schema privado de teste de concorrência no banco.
- **Interface:** Chrome com sessão autora/receptora independentes em `erp-dents-homolog`, dados fictícios, edição/ação aberta e alteração remota. Exercitar erro/recuperação e perda de acesso; verificar foco/acessibilidade de barreira, capturas claro/escuro e contagem de requisições. Registrar limites: mesmo PC não comprova capacidade da clínica.
- **Entrega:** build e regressões pertinentes, CI completo, cópias antes de atualização, preservação de linhas/histórico/arquivos, limpeza de schemas privados, commit/push e HEAD remoto. Não remover volumes nem publicar logs locais/credenciais. Não repetir testes aprovados sem mudança/falha.

## Retomada

Preparação concluída por inspeção e validação documental. Nenhum rebuild/reinício/migração ou teste de runtime nesta entrega. Último CI funcional aprovado: `37050828988`, 302 backend/153 frontend e seis imagens sem achados; homologação permanece no estado validado da 3A.2.2.

**Próximo: implementar 3A.3.1.1**, iniciando pelos testes de vários consumidores/perfis e falha/recuperação do leitor compartilhado. Inspecionar o contrato atual de `usePermissions`, os leitores locais de painel/consulta e o tratamento global de 401 antes de editar. Não reabrir revisão geral nem implementar todos os recortes acima de uma vez. Nenhuma decisão de negócio bloqueia este início.

### Retomada atual — 03/10/2026

**3A.3.1.1 concluída como fundação sem ativação**, implementação `9068759`; [evidências](./homologacao-etapa-3A-3-1-1.md). CI `37055537228` aprovado (302 backend/169 frontend, HTTP, builds e seis imagens sem achados). Provider/estados/cancelamento testados, sem alterar runtime da homologação. Não é prova de revalidação universal ou de preservação de formulários nos guards reais.

**Próximo: 3A.3.1.2**, conforme ajuste de integração acima: montar fonte única, migrar consumidores e leitores locais de forma coordenada, implementar barreiras/limpeza/revisão de ações e revalidar perfil divergente. Testar integração e Chrome/HTTP reais antes de ativar na homologação. Não adicionar o provider isoladamente ao App nem repetir testes aprovados sem mudança/falha.

### Retomada após integração — 03/10/2026

Implementação `5f68df1` publicada: fonte única ativada, guards/menu/ações integrados, rascunhos preservados sob barreira transitória, suspensão de escrita com retomada explícita e tentativa financeira preservada. 178 frontend, builds, Chrome e capturas aprovados; dados preservados. [Relatório](./homologacao-etapa-3A-3-1-2.md).

**3A.3.1.2 ainda não concluída:** CI `37132642265` parou na auditoria npm por vulnerabilidade de `braces`, dependência da cadeia Tailwind 3 sem versão corrigida disponível. Homologação principal não atualizada. Próximo recorte é manutenção da cadeia Tailwind com revisão de compatibilidade/estilos e testes, depois novo CI completo e atualização/preservação. Não iniciar 3A.3.2.1 nem suprimir a auditoria para declarar aceite.

### Retomada atual — integração concluída em 03/10/2026

**3A.3.1.2 e 3A.3.1 concluídas**, commits `5f68df1`/`8424963`. Migração Tailwind removeu cadeia vulnerável; CI `37140978695` aprovado, 302 backend/178 frontend, HTTP, builds e auditorias/seis imagens sem achados. Chrome e revisão visual aprovados; somente web principal atualizada, dez verificações integradas/HTTPS e preservação confirmados, revisão 0024/zero schemas. [Evidências](./homologacao-etapa-3A-3-1-2.md).

**Próximo: 3A.3.2.1, lista/resumo financeiro.** Inspecionar consultas/chaves/filtros e estado das ações; atualizar leituras sem substituir formulário, versão ou identidade de tentativa. Histórico/detalhe fica em 3A.3.2.2. R19 permanece parcial; não reabrir diagnóstico geral nem repetir validações sem mudança/falha. Requisitos de navegador atualizados em `sessao-e-https.md`.

### Retomada atual — financeiro parcial concluído em 04/10/2026

**3A.3.2.1 concluída**, implementação `22a29ff`. Lista/resumo independentes, filtros/rascunhos/tentativas preservados, erros sem saldo zero falso, cancelamento e revogação tratados. [Evidências](./homologacao-etapa-3A-3-2-1.md): CI `37167240927` aprovado (302 backend/194 frontend), Chrome e regressão histórica, auditorias, atualização somente web, dez verificações integradas/HTTPS e preservação aprovados. Revisão 0024/zero schemas privados.

**Próximo: 3A.3.2.2, histórico financeiro e ações abertas**, segundo os critérios do contrato acima. Preservar identidade da tentativa e exigir revisão explícita, tratar 404/403/troca de seleção e verificar acesso ao histórico com permissão de leitura. R19 permanece parcial; não repetir testes aprovados sem mudança/falha.

### Retomada atual — financeiro concluído em 04/10/2026

**3A.3.2.2 e 3A.3.2 concluídas**, implementação `ab3ac8b`, seletores finais `ffd7f0f`. Histórico atualiza sem trocar snapshot/tentativa da ação; leitura, falhas, cancelamento, 404/403 tratados. [Evidências](./homologacao-etapa-3A-3-2-2.md): CI `37177193633` aprovado (302 backend/208 frontend, HTTP/builds/auditorias), Chrome/regressão de respostas perdidas aprovados; somente web atualizada, HTTPS/dez verificações e preservação aprovados, revisão 0024/zero schemas privados.

**Próximo: 3A.3.3, pacientes**, conforme critérios acima. Atualizar lista/busca sem substituir edição ou renovar confirmação/fingerprint de exclusão e exames; exigir revisão explícita. Referências gerais/exames têm recortes próprios; R19 parcial. Não repetir testes aprovados sem mudança/falha.
