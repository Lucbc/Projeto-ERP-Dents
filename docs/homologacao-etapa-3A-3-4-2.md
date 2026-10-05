# Homologação 3A.3.4.2 — dentistas

Início em 05/10/2026, base `7fdf9af`. [Contrato](./plano-etapa-3A-3.md). Em andamento; sem mudança de API, transação ou migração.

## Implementação

- Lista/busca na chave `[dentists, list, busca]`, com política 15s/60s, cancelamento, pausa oculto/offline, retorno/manual, última leitura e limite 100/total. Falha inicial não significa lista vazia; falha transitória conserva a última leitura identificada.
- Nome/especialidade/horários/ativação remotos atualizam a lista, mantendo rascunho e versão capturados. Exclusão remota não apaga a edição; resposta 404/409 bloqueia novo envio até revisão explícita. Conflito de disponibilidade mantém seu fluxo próprio.
- Atualização automática não libera revisão de disponibilidade ou exclusão. Referências de especialidades não recebem polling. Negação 401/403 desmonta formulário/lista e remove apenas caches da lista de dentistas; referências de outros formulários permanecem isoladas.
- Regra de bloquear redução de horários/inativação que prejudique consultas futuras permanece no servidor. Harnesses existentes de disponibilidade/exclusão agora verificam que polling não libera suas revisões.

## Validação

| Camada | Evidência |
| --- | --- |
| Componentes | 43 testes focados aprovados; 11 novos cobrem atualização/limite/especialidade/horário, versão e rascunho, 404/409, falha/60s, busca cancelada/tardia, 401/403, pausa/retorno/sem sobreposição, sinal Axios, revisão de exclusão e disponibilidade |
| Frontend | 250 testes/31 arquivos aprovados em 45,09s; TypeScript/Vite aprovados em 26,11s, aviso de bundle existente; imagem web construída |
| Dependências | npm/Python aprovados |
| Chrome | Pendente harness novo com sessões independentes e regressões de disponibilidade/exclusão |
| API/banco/CI | Pendente CI completo; sem alteração de API/banco |
| Preservação | Backups públicos/exames/fingerprints/dump integral `pre-3A-3-4-2*` salvos. Helper `.data/upgrade_3a342.py`, retomar somente `after`. Principal ainda não atualizada |

## Retomada

Concluir builds/Chrome/CI/auditorias e, após aceite, atualizar somente web de `erp-dents-homolog`, verificar HTTPS/build servido, dez verificações integradas, preservação e zero schemas privados; publicar fechamento. Não repetir backups `before/full` nem testes aprovados sem mudança/falha. Logs/capturas/dados fictícios permanecem locais e ignorados, nenhum volume removido.

Próximo após fechamento: **3A.3.5.1, usuários**. Referências gerais permanecem em 3A.3.7; R19 parcial. Testes Chrome no mesmo PC não demonstram capacidade/estações físicas/outros navegadores.
