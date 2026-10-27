# Retomada da homologação operacional — 23/10/2026

## Estado atual — 27/10/2026

Decisões da etapa 4 recebidas: evolução por consulta com rascunho/finalização/adendos e leitura por permissionamento. [Contrato 4A](./plano-etapa-4.md) definido; próximo 4A.1, persistência/autorização com testes isolados. As perguntas pendentes abaixo são históricas.

Preparação da etapa 4 [inventariada](./plano-etapa-4.md). Próximo depende de definir com a clínica a prioridade e a leitura das novas evoluções; proposta e aceites concretos registrados. Nenhuma ampliação do piloto de cadastros.

**Percurso operacional ampliado aprovado:** [recepção até pagamento](./homologacao-percurso-operacional.md), mesmo paciente/consulta, três sessões e evidências por interface/HTTP/SQL. Próximo: preparação da etapa 4, atendimento/prontuário, com escopo clínico a definir. A sequência abaixo fica como histórico; nenhum módulo adicional foi liberado para produção.

Datas e horários concluídos na [matriz 3B.5](./homologacao-etapa-3B-5.md), com limites por camada e R21 residual explícitos. Instalação vigente: `piloto-cadastros-v0.1.23`. Próximo: executar o percurso recepção → consulta → dentista → lançamento → pagamento com o mesmo paciente fictício, conforme critérios da matriz. As referências de versão e próximas ações abaixo são históricas. P3 físico segue prioritário; liberação permanece restrita aos cadastros.

## Decisão e objetivo

Retomar o plano principal, por autorização do usuário, para entregar fluxos úteis à clínica. O piloto `piloto-cadastros-v0.1.18` continua disponível para instalação assistida. Não condicionar a digitação inicial ao encerramento de agenda, financeiro ou casos excepcionais de conexão. Instalação física P3 tem prioridade assim que houver os dados do outro Windows.

Base de produto: `23c08ff`. Esta retomada não altera produto, dependências, banco ou procedimento de instalação; não gera outra versão do instalador.

## Ordem e critérios de saída

| Entrega | Resultado esperado | Critério para concluir |
| --- | --- | --- |
| Base operacional de agenda/consulta | Saber quais percursos já funcionam na versão atual | Concorrência API/SQL, propagação em lista/calendário e recepção/dentista em Chrome; registrar limites |
| Datas financeiras — 3B.2C/D | Cobranças ficam vencidas conforme o dia da clínica | Fechar o [contrato existente](./plano-etapa-3B-2.md), incluindo lista, resumo e indicador visual; preservar histórico |
| Horários da agenda — 3B.3 | Operadores veem e editam o mesmo horário de consulta | Fluxo criar → consultar em outro fuso → reagendar → cancelar, conforme [plano 3B](./plano-etapa-3B.md); sem deslocamento ou sobreposição |
| Aceite operacional ampliado | Percurso completo da recepção ao acompanhamento financeiro | Criar paciente e consulta pela interface, acompanhar com conta do dentista, gerar lançamento, registrar pagamento e conferir histórico/permissões; relacionar cada prova e corrigir bloqueadores |
| Instalação física P3 | Começar a digitar cadastros reais | Outro Windows, segunda estação, reinício, cópia externa e recuperação conforme roteiro; prioridade sobre as linhas anteriores |

Atendimento/prontuário completo exige critérios próprios: acompanhar consultas e exibir dados do paciente não prova registro clínico completo. Não ampliar a liberação silenciosamente.

## Evidências reaproveitadas

- Cadastros, pesquisa, edição e recuperação de sessão: [liberação do piloto](./LIBERACAO-PILOTO-CADASTROS.md) e atualizações referenciadas ali. Não repetir toda a bateria sem mudança que a afete.
- Backup e atualização com preservação: [U1.14](./ATUALIZACAO-U1-14.md). Ensaio isolado não substitui instalação física; não foi repetido nesta retomada.
- Datas civis, vencimento sugerido e geração por consulta: [3B.1](./homologacao-etapa-3B-1.md), [3B.2A](./homologacao-etapa-3B-2A.md), [3B.2B](./homologacao-etapa-3B-2B.md). Atraso financeiro e instantes da agenda permanecem pendentes.

## Validação desta retomada

Imagens API/web reconstruídas da base atual, sem substituir os containers principais (`.data/retomada-operacional-build.log`). Todos os cenários usam dados fictícios, API/schema privados de `erp-dents-homolog`; navegadores usam HTTPS privado na porta 18444.

### API e banco — aprovado

`scripts/smoke_agenda_homolog.py`, log local `.data/retomada-operacional-agenda-api.log`, saída 0:

- Reservas concorrentes do mesmo dentista ou paciente: uma aceita, outra recusada com 409.
- Reagendamentos concorrentes preservam registros; reativação conflitante recusada.
- Cancelamento libera horário; horários adjacentes continuam permitidos.
- Consulta SQL direta confirma zero pares ativos sobrepostos após as operações.

### Interface e API — agenda aprovada

`scripts/smoke_agenda_refresh_browser_homolog.py`, log local `.data/retomada-operacional-agenda-browser.log`, saída 0:

- Duas sessões independentes do Chrome; criação, reagendamento, cancelamento e exclusão propagados na lista e no calendário.
- Criação observada em 15.040 ms na lista e 14.954 ms no calendário; oito leituras por cenário. Não representa latência garantida na rede física.
- Rascunho preservado, gravação com versão desatualizada recusada, recuperação após 503 e ausência de gravações automáticas.
- Screenshots claro/escuro produzidos pelo harness; não houve revisão visual manual nesta rodada.

O escritor desses testes altera dados pela API; o leitor observa a interface. Isso não equivale ao percurso completo de criação e atendimento manual pela interface, que permanece no aceite ampliado.

### Interface e API — recepção/dentista aprovadas

`scripts/smoke_consultation_refresh_browser_homolog.py`, log local `.data/retomada-operacional-consulta-browser.log`, saída 0:

- Contas distintas de administrador e dentista; atualização de telefone observada em 15.216 ms, busca e seleção preservadas.
- Reagendamento, cancelamento e exclusão refletem na próxima consulta; paciente excluído deixa de exibir detalhes.
- Falha temporária recuperável e revogação da permissão retirando conteúdo; nenhuma gravação automática pelo leitor. Dezoito leituras clínicas no cenário.
- Não houve consulta SQL específica dos dados clínicos neste cenário; as verificações funcionais ocorreram na interface/API. SQL específico de sobreposição pertence ao cenário de concorrência acima.

Os três harnesses concluíram reinício e limpeza dos recursos temporários, preservando dados e volumes originais. Nenhum bloqueador identificado nesses cenários; isso não fecha a homologação completa de agenda/financeiro/prontuário. Links locais e `git diff --check` aprovados. CI completo não repetido porque a alteração publicada é exclusivamente documental.

**Retomada:** iniciar 3B.2C pelo contrato existente, reproduzindo resumo/indicador com relógio controlado antes da correção. Depois concluir 3B.2D e avançar para 3B.3. Não repetir este levantamento nem iniciar o diagnóstico adiado de logout.

## Controle de escopo

- Corrigir primeiro falhas que impeçam um percurso normal, comprometam dados ou permitam acesso indevido demonstrado.
- Não criar uma nova fase para cada hipótese de falha rara. Resposta perdida no logout fica no backlog, salvo evidência de bloqueador.
- Cada entrega registra capacidade obtida, testes por camada, pendências e próximo passo. Falha em teste deve ser investigada antes de declarar aceite.
- Atualizar roteiro e pacote quando houver mudança real de instalação/produto e seus aceites; manter commit/push ao concluir alterações.

## Fechamento 3B.2C/D — 23/10/2026

Etapa 3B.2 concluída: [atraso clínico e evidências C](./homologacao-etapa-3B-2C.md), [consolidação A/B/C e limites D](./homologacao-etapa-3B-2D.md). Código final `6f08e88`, CI 40000877678 aprovado (328 backend, 427 frontend, builds/HTTP e seis imagens sem achados), versão de instalação v0.1.19. Próximo: 3B.3 — horários, entradas e filtros da agenda. Este fechamento substitui as próximas ações históricas acima. P3 físico prioritário quando houver os dados do servidor.
## Fechamento 3B.3A e preparação 3B.3B — 25/10/2026

Precisão de horários preservada na edição de consultas, Zod/resolvers e Brotli corrigidos; [evidências 3B.3A](./homologacao-etapa-3B-3A.md). Código de produto `f3d4516`, CI 40245360588 aprovado: 328 backend, 429 frontend, builds/HTTP e auditorias de pacotes/seis imagens sem achados. Versão de instalação v0.1.20; liberação restrita aos cadastros, sem migração/configuração nova.

[Diagnóstico 3B.3B](./diagnostico-etapa-3B-3B.md) também aprovado, commit `adb65d6`: mesma consulta diverge entre fusos na lista/editor/posição do calendário e filtro do dia, sem gravação ou alteração SQL. Próximo: implementar conversão de fuso, filtros e calendário em conjunto, incluindo consumidores compartilhados; preparação concluída, correção pendente. Este fechamento substitui próximas ações históricas acima. P3 físico prioritário quando houver dados do servidor.
