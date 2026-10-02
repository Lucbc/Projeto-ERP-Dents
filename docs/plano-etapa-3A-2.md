# Etapa 3A.2 — painel e consulta do dentista

Preparação em 01/10/2026, base `ac60b3d`. Continuação do [contrato 3A](./plano-etapa-3A.md), depois da agenda homologada. Esta entrega é uma inspeção de código e definição de aceite; não altera funcionalidades, não executa novos testes de navegador/API/banco e não promete atualização já entregue nessas telas.

## Diagnóstico por inspeção

| Área | Evidência no código | Consequência para a implementação |
| --- | --- | --- |
| Painel | `apps/web/src/pages/dashboard-page.tsx`: três `useQuery`, sem intervalo; pacientes/dentistas com limite 1 e total da resposta; agenda do dia com chave constante | Atualizar cada recurso sem polling global de cadastros; não tratar o primeiro item como contagem |
| Falhas do painel | Qualquer `isError` substitui todo o painel; contagens usam fallback zero | Separar estados por recurso; zero somente após leitura válida com total/lista vazios |
| Dia do painel | Limites locais calculados dentro da função de leitura, chave sem data e sem temporizador da virada | Incluir período na chave e detectar mudança de dia, inclusive após aba oculta/offline; não apresentar ontem como hoje |
| Semântica do painel | Lista todas as consultas com início no dia, inclusive passadas/canceladas; título diz “Próximas consultas de hoje” | Preservar conjunto/contagem e usar título fiel “Consultas de hoje”, sem alterar regra de atendimento |
| Consulta | `apps/web/src/pages/consultations/consultation-page.tsx`: próxima, pacientes e detalhe são leituras distintas; detalhe condicionado à seleção | Atualização independente, busca/seleção estáveis; nenhuma chamada de detalhe sem paciente selecionado |
| Escopo clínico | `consultation_use_cases.py`: pacientes globais; próximas consultas do dentista, com início >= agora UTC, excluindo apenas canceladas; detalhe retorna até cinco futuras, mas UI mostra apenas a próxima | Preservar acesso/conjunto/ordenação existentes; não transformar a lista em pacientes exclusivos do dentista nem inventar atendimento em andamento |
| Rota e API | `app.tsx`/menu limitam Consulta a dentista; API aceita outros perfis autorizados com dentista explícito e ignora escopo solicitado pelo dentista em favor de seu vínculo | Não abrir a rota para outros perfis; testar que a atualização não permite consultar agenda de outro dentista |
| Permissões do painel | Rota exige `dashboard.view`, mas GETs exigem `patients.view`, `dentists.view` e `appointments.view`; `usePermissions` tem staleTime 30s, sem intervalo | Painel permitido não concede acesso aos dados; revogação da rota pode não causar 403 nos GETs. Revalidar permissões durante essas telas, sem presumir que polling de dados cobre tudo |
| Infraestrutura reutilizável | `use-live-query.ts` não tem opção de habilitação externa; 403 remove todo o prefixo da chave; `live-query-status.tsx` usa textos de agenda | Adaptar cuidadosamente para leituras condicionais e múltiplos recursos, mantendo regressão da agenda. Evitar ciclo de remoção/releitura entre observadores do mesmo prefixo |
| Serviços | `patientService.list`, `dentistService.list` e métodos de consulta não recebem `AbortSignal` | Acrescentar sinal opcional, compatível com chamadas atuais, e cancelar respostas de busca/seleção antigas |

Não repetir o probe genérico de desatualização da preparação 3A, nem criar testes permanentes que esperem o defeito. Os comportamentos acima são constatações de código, não nova prova dinâmica de duas estações.

## Contrato comum

- Reutilizar política opt-in: leitura a cada 15s visível/conectado, 60s após falha, retorno/reconexão/manual; sem sobreposição por chave e sem escrita automática. Ocultar/offline pausa novas leituras; reconexão não garante disponibilidade do servidor.
- Última leitura bem-sucedida e erro identificados por seção/recurso. Não exibir uma hora única de “painel atualizado” se uma das leituras falhou; respostas independentes não são snapshot transacional.
- Falha inicial não representa zero/lista vazia/ausência de próxima consulta. Falha transitória após sucesso mantém dados anteriores identificados como desatualizados, desde que o acesso continue válido. `null` de próxima consulta é resposta válida e deve ter timestamp de sucesso.
- 401 segue encerramento de sessão existente. 403 oculta dados daquele recurso e interrompe suas leituras; na Consulta, perda de `consultations.view` oculta todas as seções. Não recuperar acesso automaticamente com dados antigos após negação; reentrada/revisão de acesso precisa ser explícita.
- Revalidar `permissions.me` nas páginas abrangidas para perfis não administradores, usando a chave compartilhada atual e sem temporizador por card. Considerar retorno/reconexão/intervalo de 15s; estado desconhecido ou erro de autorização não mantém dados restritos expostos. Revogar `dashboard.view` deve bloquear a página mesmo se as permissões dos GETs continuarem ativas. Atualização universal de permissões nas demais páginas permanece na 3A.3.
- Autorizações continuam no servidor; ocultação de UI não as substitui. Não ampliar matrizes padrão, vínculo clínico ou permissões de leitura para fazer polling funcionar.
- Não trocar rascunhos de outras telas nem atualizar referências de formulários por efeito colateral. Cancelamento/limpeza de cache precisa considerar consultas irmãs e isolamento entre sessões.

## 3A.2.1 — painel, período e estados por indicador

Primeiro recorte funcional. Sem nova migração/endpoint previsto.

1. Generalizar habilitação/textos/escopo de erro da infraestrutura apenas no necessário, com regressão focada da agenda. Cada card requer permissão de seu recurso além da permissão da página.
2. Atualizar totais de pacientes/dentistas e consultas do dia, mantendo as chaves dos contadores distintas das listas/seletores. Não buscar todas as páginas para contar cadastros.
3. Manter o conceito atual de dia do navegador neste recorte. Chave inclui dia e limites efetivamente solicitados; verificar virada com página aberta e retorno após meia-noite. Na troca de período, não rotular resultado do dia anterior como atual. Fuso central da clínica e demais correções de datas terão contrato próprio na etapa 3.
4. Preservar consultas canceladas/passadas na contagem/lista, exibir status e usar título “Consultas de hoje”. Não alterar critérios de agenda, conflito, ordenação ou horários.
5. Permissão negada em um recurso não deve apagar indicadores independentes ainda autorizados. Sem acesso a nenhum recurso, mostrar estado explícito, sem três zeros fictícios.

### Aceite

- Componentes: três leituras independentes; atualização remota simulada; sucesso com zero; falha inicial/parcial/após sucesso; timestamp por recurso; botão; pausa/retorno; consulta lenta sem duplicação; revogação de recurso/rota; troca de sessão; nenhuma escrita.
- Relógio controlado: meia-noite com tela aberta e retorno de aba oculta/offline; dia antigo não reaparece por resposta atrasada; limites enviados correspondem ao dia da chave. Incluir pelo menos dois fusos de navegador, sem mudar relógio do sistema operacional/servidor.
- HTTP em schema privado: matrizes distintas (`dashboard.view` não libera pacientes/dentistas/agenda); autenticação/403 dos recursos. Sem novos testes transacionais se contrato do banco permanecer igual.
- Chrome com duas sessões, dados fictícios: mudanças de cadastros/agenda recebidas nos indicadores, cancelamento mantido como status e exclusão refletida; falha parcial/recuperação; perfis e revogação; temas claro/escuro. Registrar quantidades de GET e latência observada, distinguindo cenários simulados.
- Build, testes apropriados/CI, cópias, atualização web, preservação, commit/push e fechamento antes de 3A.2.2. API somente se inspeção/aceite demonstrar necessidade, documentando mudança de escopo.

## 3A.2.2 — próxima consulta, pacientes e detalhe

Depois do fechamento de 3A.2.1. Rota permanece restrita a dentista.

- Atualizar próxima consulta global, lista com busca atual e detalhe do paciente escolhido. `enabled` para detalhe vazio não agenda chamada nem mostra carregamento infinito.
- Manter busca e identidade selecionada durante atualizações; mudanças no próximo agendamento não selecionam outro paciente automaticamente. Respostas lentas da busca/seleção anterior não substituem a seleção atual.
- Reagendamento/cancelamento/exclusão e passagem do horário inicial devem refletir o próximo registro segundo as regras atuais do servidor. Não inventar estado de atendimento ou alterar filtro de status neste recorte.
- Detalhe 404 deve ocultar dados antigos daquele paciente e informar indisponibilidade, sem escolher outro nem apagar a busca. Distinguir de erro transitório; definir recuperação manual explícita sem laço a cada 15s para registro ausente. 403 de consulta bloqueia a página como recurso único.
- Preservar limite atual de 100 pacientes e offset 0; explicitar quando o total excede a lista exibida. Paginação completa e política de acesso clínico permanecem nos respectivos recortes da etapa 3/4; não alegar cobertura de todos os pacientes.

### Aceite

- Componentes: condicionamento do detalhe; busca/seleção preservadas; cancelamento de respostas antigas; próxima `null`; falha/recuperação por seção; 404/403/401; nenhuma escrita; troca de vínculo/sessão sem cache de outro usuário.
- HTTP privado com dois dentistas: próxima por vínculo, tentativa de parâmetro alheio, pacientes sem futura, paciente inexistente, cancelamento/reagendamento, permissão negada e conta sem vínculo. Não alterar autorização para acomodar fixtures.
- Chrome com sessão dentista receptora e sessão administrativa autora: mudança de cadastro/próxima consulta refletida nas seções, seleção e busca estáveis, exclusão do paciente sem dados remanescentes, erro/recuperação e perda de acesso. Massa pequena explicitada, sem promessa de capacidade da clínica.
- Regressão apropriada de 3A.2.1/agenda, CI, cópias/atualização/preservação/publicação e fechamento. Sem migração prevista.

## Entrega da preparação (histórico)

Somente documentação. Nenhum rebuild, reinício ou acesso a dados necessário; não foi repetida a suíte aprovada da 3A.1 (`36865996602`, 302 backend/129 frontend). Principal não alterado por esta preparação. Documentação revisada contra fontes de UI/serviços/rotas/casos de uso/repositório/permissões; validar links locais e diff antes de publicar.

**Próximo: implementar 3A.2.1**, começando por testes dos estados independentes, autorização e virada do dia. Nenhuma decisão de negócio bloqueia esse recorte: semântica atual preservada e escolhas técnicas acima explícitas. R19 continua parcial; não declarar painel/fila corrigidos antes de implementação e aceite. Instalação assistida/atalhos/backup permanecem na etapa 5.

## Retomada anterior — 02/10/2026

**3A.2.1 concluída**, implementação `558a3fd`; [homologação](./homologacao-etapa-3A-2-1.md). CI `36907712732` aprovado em 01/10 (302 backend/141 frontend, HTTP, builds e auditorias), Chrome com duas sessões e datas controladas em dois fusos aprovados. Web atualizada, dados/arquivos preservados, revisão 0024 sem migração. Fechamento documental em 02/10.

**Próximo: implementar 3A.2.2**, usando o contrato e aceite acima. Preservar busca/seleção, escopo clínico e autorização; distinguir ausência de paciente de falha transitória. Não repetir diagnóstico geral ou testes aprovados do painel sem mudança/falha. R19 parcial, instalação assistida na etapa 5.

## Retomada atual — 3A.2 concluída em 02/10/2026

**3A.2.2 concluída**, implementação `2500b01` e manutenção de imagens `f40bde9`. [Homologação](./homologacao-etapa-3A-2-2.md): CI final `37050828988` aprovado, 302 backend/153 frontend, HTTP, builds e seis imagens sem achados. Chrome verificou atualização independente, busca/seleção preservadas, 404/manual e perda de acesso. Homologação atualizada, dados/arquivos preservados, revisão 0024 sem migração. Regras clínicas e limite de 100 pacientes mantidos.

Painel e consulta encerram 3A.2. **Próximo: preparar 3A.3**, conforme [plano geral](./plano-etapa-3A.md), dividindo financeiro/cadastros/exames/permissões efetivas em recortes verificáveis. R19 permanece parcial; não repetir testes aprovados ou ampliar automaticamente a política para todos os formulários. Instalação assistida permanece na etapa 5.
