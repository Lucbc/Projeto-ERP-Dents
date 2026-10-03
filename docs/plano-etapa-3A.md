# Etapa 3A — atualização entre computadores

Preparação concluída em 29/09/2026, base `42546fc`. R19 continua aberto: esta entrega documenta diagnóstico e contrato; não altera o comportamento do produto.

## Evidência e limites

Probe local `.data/probe_refresh_3a.py`/`.cjs`, Chrome com dois contextos independentes e IDs de sessão distintos, API/schema descartáveis do `erp-dents-homolog`, HTTPS confiável e dados fictícios:

1. Uma sessão cria um usuário; a outra abre a lista.
2. A primeira altera o nome. Depois de 18 segundos, a segunda continua exibindo o nome anterior, sem novo GET de usuários. Voltar para a página também não provoca leitura no cenário observado.
3. Recarregar a página recebe o nome atual.
4. A segunda abre edição e digita um rascunho. Outra alteração remota torna sua versão antiga; salvar recebe 409 e conserva o rascunho.

Harness também aprovou bootstrap/reinício/limpeza. Isto demonstra interface + HTTP com sessões independentes no mesmo computador; não é ensaio físico de duas estações, carga ou teste de reconexão. Agenda e demais recursos abaixo foram inspecionados, não reproduzidos individualmente nesta preparação. Não adicionar teste permanente que espere a desatualização como comportamento correto.

## Inventário

| Área | Situação observada | Cuidado na correção |
| --- | --- | --- |
| `lib/query-client.ts` | `staleTime: 15000`, foco desativado, sem intervalo configurado | Tempo de obsolescência não agenda leitura. Não habilitar polling global indiscriminadamente |
| Agenda/lista | Chaves `appointments` com filtros/período; invalidação após mutação fica no próprio cliente | Atualizar consultas sem trocar versão/valores do formulário aberto |
| Calendário/lista: referências | Pacientes/dentistas/procedimentos carregados separadamente; efeito recalcula fim pela duração sugerida | Atualizar procedimentos em segundo plano pode alterar fim digitado quando sugestão está ativa; risco por inspeção. Excluir catálogos do primeiro recorte |
| Consulta do dentista | Próxima consulta, pacientes e detalhe em chaves `consultations` por identidade/vínculo | Refletir cancelamento/reagendamento sem confundir erro com fila vazia; escopo clínico permanece assunto próprio |
| Painel | Contagens e consultas de hoje são consultas independentes | Evitar totais falsamente zerados em falha; mudança de dia merece teste específico |
| Financeiro | Lista/resumo/histórico separados; seletores têm outras chaves | Mostrar eventual diferença temporal, preservar versão/identidade de baixa e estorno |
| Cadastros/exames | Listas, detalhes, prévias e seletores distintos | Não renovar silenciosamente confirmação destrutiva ou conjunto de exames |
| Permissões | Matriz de cada perfil guarda rascunho próprio; permissões efetivas têm cache de 30s | Revalidar acesso e ocultar dados em 403; não reinicializar rascunhos a cada leitura |
| Sessão | Cliente por sessão e cancelamento de respostas antigas; eventos locais sincronizam identidade/expiração | Esses eventos não distribuem alterações entre PCs. Preservar isolamento e revogação existentes |

## Estratégia de implementação

Começar com consultas periódicas dos recursos operacionais selecionados. Usar infraestrutura existente de consultas para compartilhar requisições por chave e evitar temporizadores duplicados. SSE/WebSocket não são necessários para o primeiro recorte; avaliar depois se a carga medida ou exigência de latência justificar.

Parâmetros iniciais de engenharia, sujeitos à homologação: intervalo de **15 segundos** com página visível e conexão disponível, mais tempo de resposta do servidor. Não prometer prazo em aba suspensa, rede indisponível ou servidor lento. Pausar em aba oculta/offline; solicitar atualização ao voltar/recuperar conexão e oferecer ação manual. Em falhas repetidas, espaçar tentativas (até 60 segundos), sem laço de requisições nem tentativas automáticas de escrita. Limitar sobreposição por chave; testar foco/reconexão junto ao intervalo.

Exibir última atualização bem-sucedida e estado de atualização/falha. Erro de rede/5xx pode manter a última leitura identificada como desatualizada; primeira leitura falhando não representa lista vazia. 401 encerra a sessão conforme protocolo existente; 403 não deve manter dados restritos expostos. O estado `online` do navegador não comprova que o servidor está disponível. Recuperação deve ocorrer sem apagar rascunhos ou reenviar mutações.

Manter versão e identidade capturadas ao abrir ações. Atualização da lista nunca substitui a versão do formulário. Conflito continua exigindo recarga explícita. Exclusões/baixas/cancelamentos remotos atualizam a visualização, mas não confirmam ações antigas automaticamente. Não incluir parâmetros sensíveis ou conteúdo de respostas em diagnóstico persistido.

## Recortes e aceite

### 3A.1 — agenda em lista e calendário

Primeira implementação: política reutilizável de leitura e indicação de atualização aplicada **somente às consultas da agenda/lista e calendário**, conservando filtros/período. Referências dos formulários ficam fora da atualização periódica inicial. Sem migração prevista.

- Componentes com relógio controlado: intervalo, visibilidade, reconexão, botão manual, requisição lenta, falha inicial e falha com dados antigos, ausência de sobreposição e cancelamento na troca de sessão.
- Edição aberta mantém campos/versão quando a lista recebe outra versão; catálogos não recalculam fim devido à nova política. Ações destrutivas mantêm confirmação capturada; não há mutação automática.
- Erros 401/403 ocultam dados conforme acesso; timeout/5xx não viram agenda vazia nem removem rascunho por desmontagem do formulário.
- Chrome com duas sessões independentes: criação, reagendamento, cancelamento e exclusão remotos aparecem na tela receptora no intervalo esperado; filtros/período mantidos, rascunho preservado e conflito explícito. Exercitar falha/recuperação de leitura e aba oculta/retorno. Distinguir intervalo de agendamento de leitura do tempo total de resposta.
- HTTP confirma versões/conflitos/autorização existentes. Nenhuma alteração de regra de disponibilidade ou proteção do último administrador.
- Contar requisições por sessão/chave, registrar massa e condições; não alegar capacidade para toda a clínica sem carga na etapa 6.
- Build, regressões apropriadas, CI, cópias/preservação, atualização web da homologação e commit/push. API só se houver necessidade identificada e documentada.

### 3A.2 — painel e fila do dentista

Após 3A.1, detalhar atualização de indicadores/próxima consulta/lista/detalhe, mudança de dia e perda de acesso. Validar perfis e estados vazios/rede em recorte próprio; não ampliar acesso clínico por consequência da atualização.

### 3A.3 — demais telas e permissões efetivas

Detalhar financeiro, cadastros, exames e permissões por recurso; preservar confirmações, rascunhos e dados sensíveis. Avaliar seletores e dependências antes de ampliar a política. R19 só se encerra após cobertura dos fluxos acordados; não declarar solução universal com a agenda apenas.

## Entrega da preparação (histórico)

Principal permanece na revisão `0024_user_version`, sem rebuild/reinício/migração nesta preparação. Preservação comparada com checkpoint 2B.8.3.2 e limpeza dos schemas privados verificadas. Probe/logs ignorados pelo Git, sem segredos publicados. Último CI funcional `36571964718` aprovado (301 backend/121 frontend); não repetido para documentação.

**Próximo: implementar 3A.1**, começando por testes de atualização e preservação de formulário. Não repetir a revisão geral nem reabrir 2B. Instalação assistida/atalhos/backup permanecem na etapa 5. Nenhuma decisão de negócio bloqueia este primeiro recorte; o intervalo inicial é uma escolha técnica a validar, não compromisso de latência já homologado.

## Retomada atual — 01/10/2026

**3A.1 concluída.** [Evidências](./homologacao-etapa-3A-1.md): lista/calendário com atualização em 15s sob condições de visibilidade/conexão, falhas espaçadas, estado explícito e rascunhos preservados. Chrome com duas sessões aprovado; CI `36865996602` com 302 backend/129 frontend, HTTP, builds e auditorias aprovados. API/web/infra atualizados com preservação de dados/arquivos; revisão 0024, sem migração. Manutenções de PyJWT/OpenSSL/libpng e recuperação de travamento local do Docker documentadas.

**Próximo: preparar 3A.2**, detalhando indicadores, fila/próxima consulta e detalhe do dentista, mudança de dia e perda de acesso. Não ampliar polling de referências sem avaliar formulários. R19 parcial até os próximos recortes; não repetir diagnóstico geral ou validações aprovadas de 3A.1. Instalação/atalhos/backup assistidos permanecem na etapa 5.

**Preparação 3A.2 concluída em 01/10/2026:** [contrato detalhado](./plano-etapa-3A-2.md), baseado em inspeção, sem mudança funcional ou nova homologação de runtime. Próximo: **3A.2.1**, painel, indicadores independentes, autorização e virada do dia. Depois **3A.2.2**, próxima consulta, pacientes/detalhe. Semântica e acesso atuais preservados; revalidar permissões nas telas abrangidas sem alegar atualização universal.

**Retomada em 02/10/2026: 3A.2.1 concluída.** [Painel homologado](./homologacao-etapa-3A-2-1.md), CI `36907712732` aprovado (302 backend/141 frontend), HTTP/Chrome e preservação aprovados. **Próximo: implementar 3A.2.2, consulta do dentista**, conforme contrato detalhado. R19 continua parcial.

## Retomada atual — 3A.2 concluída em 02/10/2026

**3A.2.2 concluída**, encerrando painel/consulta. [Evidências](./homologacao-etapa-3A-2-2.md): CI `37050828988` aprovado (302 backend/153 frontend), HTTP/Chrome, auditorias e preservação aprovados. Próxima/lista/detalhe atualizados sem trocar busca/seleção, 404/manual e revogação tratados. Web/proxies/ClamAV atualizados, revisão 0024 sem migração; manutenção pcre2/nghttp2 registrada.

**Próximo: preparar 3A.3, demais telas e permissões efetivas.** Inventariar financeiro/cadastros/exames, chaves, seletores e formulários; definir subetapas e critérios por recurso antes de implementar. Preservar rascunhos, confirmações, versões e dados sensíveis. R19 permanece parcial; não repetir diagnóstico geral ou validações aprovadas de agenda/painel/consulta. Instalação assistida continua na etapa 5.

**Preparação 3A.3 concluída em 02/10/2026:** [contrato detalhado](./plano-etapa-3A-3.md), por inspeção, sem alteração funcional ou nova homologação de runtime. **Próximo: implementar 3A.3.1.1, leitor compartilhado de permissões efetivas**, depois guards/menu/ações na 3A.3.1.2; demais recursos divididos em recortes independentes. R19 continua parcial; manter rascunhos/versionamento e não aplicar polling global indiscriminado.

**Retomada em 03/10/2026: 3A.3.1.1 concluída como fundação sem ativação.** [Evidências](./homologacao-etapa-3A-3-1-1.md): CI `37055537228` aprovado, 302 backend/169 frontend e seis imagens sem achados. **Próximo: implementar 3A.3.1.2**, integrar fonte única/guards/menu/ações e migrar leitores de painel/consulta juntos. Homologação não alterada nesta fundação; R19 permanece parcial e atualização global não está entregue.
