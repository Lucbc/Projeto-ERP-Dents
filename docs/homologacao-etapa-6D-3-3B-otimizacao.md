# 6D.3.3B.3.2 — índices e leitura clínica em lote

Implementação iniciada em 12/11 e validada localmente em 13/11/2026, base `4b9d06d`. CI e fechamento ainda pendentes. Recuperação completa C e publicação não fazem parte deste aceite local.

## Mudanças

- Migração aditiva `0031_access_audit_indexes`, posterior à 0030: índices por instante/ID, alvo/instante/ID e ação/instante/ID. Downgrade remove somente esses índices, sem apagar eventos ou proteções. Migrações anteriores preservadas.
- Página clínica carrega registros em uma consulta e seus adendos em outra, além da contagem total. O custo de consultas não cresce linearmente com o número de evoluções. Preservados ordenação, paginação, contexto, versões, adendos por ordem de versão, bloqueio administrativo, bloqueio das linhas e confirmação atômica do evento antes da resposta.
- O ensaio detecta os três índices reais e executa a migração Alembic com 192 mil eventos preenchidos. Na versão anterior continua permitindo o diagnóstico dos candidatos; não cria índices duplicados na nova versão.

## Banco e API

- Build API aprovado. Bateria clínica: 41 testes em 98,565 s, incluindo os novos testes de conteúdo/adendos/paginação/limite de consultas e migração preenchida com proteções preservadas.
- Teste adicional de revogação enquanto a página aguarda o bloqueio: aprovado em 2,944 s. Confirma ausência de conteúdo e evento após a revogação. Total de testes clínicos distintos nesta entrega: 42.
- HTTP clínico autenticado e SQL aprovados: rascunho/finalização/adendos, versões, recibos, permissões, filtros/cursor, revogação e falha de gravação do evento.
- Migração real 0030→0031 após downgrade dos índices, com 192 mil eventos: 2.598 s (inclui comando Alembic via Docker). Hash integral dos eventos igual antes/depois; três índices novamente presentes. Isso não substitui migração/restauração completa desde 0028.
- CREATE INDEX é transacional, sem modo concorrente: atualização exige janela de manutenção conforme o procedimento de servidor. O tempo medido não prevê a duração na clínica nem com volumes maiores.

## Capacidade e interface

Mesma massa e limites do [diagnóstico](./homologacao-etapa-6D-3-3B-capacidade.md): 5.000 pacientes, 192.000 eventos sintéticos, 100 evoluções, dez contas HTTP simultâneas, três lotes. 570 requisições com códigos esperados, 30 pacientes criados, exatamente 180 eventos clínicos; 90 respostas com 100 pares ID/versão. Sem perda/alteração do conteúdo clínico; hash preservado. Ambiente compartilhado, cache aquecido, sem garantia de capacidade do servidor físico.

Faixa do p95 por lote em milissegundos, não percentil agregado:

| Operação | Após otimização |
|---|---:|
| Consulta clínica | 391.25–478.02 |
| Histórico de acessos | 369.56–451.51 |
| Busca de pacientes | 118.72–137.93 |
| Criação de paciente | 165.94–216.09 |

Todos os lotes ficaram abaixo da referência diagnóstica de dois segundos. Antes, a consulta clínica tinha p95 de 1.867–1.942 ms e o histórico de 1.746–1.815 ms. Comparação entre execuções locais, sem causalidade estatística isolada; a melhoria coincide com a redução de consultas em lote e índices. A bateria clínica terminou antes da carga medida; a preparação da massa foi iniciada enquanto os últimos testes terminavam.

Chrome confirmou consulta inicial e atualização periódica sem interação, com dois eventos persistidos no banco. Navegação clínica completa Chrome/API/SQL aprovada: contexto atual/histórico, paginação, isolamento por paciente, recarga, negação administrativa e revogação ao vivo; onze registros, adendo e recibos preservados. Regressão cadastral Chrome/API/SQL aprovada: CPF/nascimento/documentos históricos/RG, permissões, busca, conflito e reabertura. Recursos privados removidos e volumes preservados.

## Pendências e reprodução

- Conferir CI do produto antes de encerrar B.3.2.
- Depois C: migração 0028→0031, dump/restauração e backup operacional Windows com exames/configuração/TLS, permissões e Chrome restaurado; atualizar guias/tag apenas ao concluir.
- Não instalar main parcial. Nenhuma alteração de comando/fluxo de instalação nesta etapa; o pacote corrigido ainda precisa ser publicado.
- Evidências ignoradas: `.data/access-batch-build.log`, `access-batch-tests.log`, `access-batch-revocation.log`, `access-batch-http.log`, `access-batch-capacity.log`, `access-capacity-metrics.json`; comparação anterior em `access-capacity-before-batch.json`. Apenas métricas e dados fictícios; segredos não publicados.

Logs adicionais ignorados: `.data/access-batch-browser.log` e `.data/access-batch-registration.log`.
