# 3B.4B — Validação de instantes na API

## Implementação — 27/10/2026

Agenda exige instantes com fuso na criação, edição e filtros. Campos obrigatórios explicitamente nulos na edição recebem 422; campos omitidos permanecem intactos e notas null continua limpando o texto. Casos de uso também protegem chamadas internas antes de comparar datas ou escrever. Não foi alterado o conversor de históricos `clinic_time`.

Novas gerações financeiras com data de pagamento sem fuso recebem erro controlado, inclusive quando pendentes. Recibo histórico com mesma chave/corpo continua recuperando o lançamento original, sem gravação. Por isso o schema dessa geração não foi convertido cegamente para `AwareDatetime`: a decisão ocorre após procurar o recibo. Demais operações financeiras preservam as proteções existentes.

## Aceites locais

- Oito testes de schemas/casos de uso aprovados: null, omissão, notas, precisão, offsets equivalentes, intervalos e chamadas internas, rejeição de nova geração e recuperação de recibo.
- HTTP/SQL em conexões UTC e São Paulo: requisições inválidas recusadas sem alterar consulta/versão, omissão preservando microssegundos, filtros equivalentes, geração inválida sem lançamentos e recibo antigo recuperado sem duplicação. Corpo divergente recebe 409; chave nova com data inválida recebe 400.
- Em São Paulo, edição com offsets -03:00/+09:00 também conferida em SQL; matriz final incluída no CI nas duas conexões.
- Imagem API reconstruída. Containers principais/volumes preservados. Apenas API/schema privados de `erp-dents-homolog`, dados fictícios. Recibo antigo preparado diretamente nesse schema para testar compatibilidade.
- Logs locais ignorados em `.data/`: `datetime-contract-unit-final.log`, `datetime-contract-acceptance-UTC.log`, `datetime-contract-acceptance-SP.log`, `datetime-contract-build-final.log`.

## Pendências para liberação

Regressões de agenda/cadastros no Chrome e CI completo. Instalação permanece v0.1.22 até aprovação; nenhuma nova tag liberada. Sem migração, dependência ou configuração nova. Ensaio operacional de atualização e instalação física não executados nesta subetapa.

Esta entrega cobre o contrato de instantes da agenda e da geração financeira. R21 em outros cadastros continua separado. Próximo: consolidar a matriz 3B.5 e então o percurso operacional completo; P3 físico prioritário quando houver os dados do servidor.
