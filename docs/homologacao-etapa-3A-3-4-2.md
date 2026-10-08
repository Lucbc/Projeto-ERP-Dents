# Homologação 3A.3.4.2 — dentistas

Início em 05/10/2026, base `7fdf9af`. [Contrato](./plano-etapa-3A-3.md). Concluída em 08/10/2026; sem mudança de API, transação ou migração.

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
| Dependências | npm/Python e seis imagens sem achados aprovados |
| Chrome | Harness novo aprovado com sessões independentes: alteração remota em 14220ms, especialidade/horário/ativação/busca, rascunho/versão e referências preservados; 409/404 reais, criação/exclusão, falha/recuperação, pausa e revogação/403. Duas escritas explícitas, nenhuma automática. Capturas claro/escuro revisadas; tabela mantém rolagem horizontal existente. Regressões de disponibilidade/exclusão aprovadas: consulta incompatível bloqueia alteração, cancelamento mais revisão explícita libera mudança; polling não libera revisão; conta vinculada impede exclusão até reassociação administrativa e nova confirmação |
| API/banco/CI | [CI 37313482197](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/37313482197) aprovado: 302 testes backend em 715,935s, 250 frontend, HTTP/builds/auditorias e seis imagens sem achados; sem alteração de API/banco |
| Preservação | Backups públicos/exames/fingerprints/dump integral `pre-3A-3-4-2*` salvos. Helper `.data/upgrade_3a342.py`, retomar somente `after`. Comparação antes e após atualização confirmou linhas/referências históricas/bytes de exames preservados; revisão `0024_user_version`, zero schemas `test_%` |

## Retomada

Implementação `ff499e4` publicada, CI e homologação encerrados com aceite verificado. Somente web de `erp-dents-homolog` atualizada; HTTPS confiável retorna 200 e JS/CSS servidos correspondem ao build validado. Dez verificações integradas aprovadas, dados e volumes preservados. Não repetir backups `before/full` nem testes aprovados sem mudança/falha. Logs/capturas/dados fictícios permanecem locais e ignorados: `.data/ci-final-3a342.log`, `.data/smoke-main-3a342.log`, `.data/browser-3a342.log`, `.data/browser-availability-3a342.log`, `.data/browser-deletion-3a342.log` e `.data/homolog/dentist-refresh-*.png`.

Próximo após fechamento: **3A.3.5.1, usuários**. Referências gerais permanecem em 3A.3.7; R19 parcial. Testes Chrome no mesmo PC não demonstram capacidade/estações físicas/outros navegadores.
