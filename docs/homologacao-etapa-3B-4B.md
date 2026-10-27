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
- Chrome/API/SQL da agenda aprovado em quatro fusos: criação, reabertura, reagendamento, cancelamento, filtros, navegação e seleção (`datetime-contract-agenda-browser.log`).
- Cadastros Chrome/API/SQL aprovados: CPF, nascimento, documentos legados, rascunhos, permissões, busca, conflitos e reabertura (`datetime-contract-registration.log`).

## Fechamento e limites

[CI 40511579039](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/40511579039) aprovado no commit `5406e90`: 493 testes frontend e 336 backend (649,889 s), builds e regressões HTTP, incluindo a matriz final UTC/São Paulo. Auditoria das seis imagens (api, web, gateway, edge, db e clamav): todas `{}`, sem achados; base de vulnerabilidades atualizada em 27/10/2026 13:12:49 UTC. Log local ignorado: `.data/datetime-contract-ci-final.log`.

Instalação atualizada para `piloto-cadastros-v0.1.23`, com guias sincronizados. Sem migração, dependência ou configuração nova. A imagem API muda em relação à v0.1.22. Ensaio operacional de atualização e instalação física não executados nesta subetapa; containers principais preservados. Piloto continua restrito aos cadastros.

Esta entrega cobre o contrato de instantes da agenda e da geração financeira. R21 em outros cadastros continua separado. Próximo: consolidar a matriz 3B.5 e então o percurso operacional completo; P3 físico prioritário quando houver os dados do servidor.

CI anterior `40510294435` cancelado ao identificar uma fixture antiga de cancelamento sem offset. Ajustada em `5406e90`, mantendo a regra de disponibilidade/duração. Suíte local sem opt-in integrado: 64 testes executados com sucesso, 272 ignorados por dependerem do ambiente integrado; não contar esses 272 como aprovados. CI final acima executou a suíte completa com sucesso.
