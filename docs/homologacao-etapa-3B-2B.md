# 3B.2B — geração por consulta no fuso clínico

Iniciada em 15/10/2026, base `8ac9f3e`. **Concluída em 15/10/2026.** [Contrato](./plano-etapa-3B-2.md). R20 permanece aberto.

## Alteração e escopo

`generate_from_appointment` aplica `clinic_time` ao início da consulta antes de extrair a data de vencimento implícita e o texto da descrição. Reutiliza `America/Sao_Paulo` e a convenção legada de interpretar horários sem offset como locais, sem alterar validação de entradas. Vencimento explícito prevalece. Consulta a operações/recibos anteriores continua antes do cálculo; nenhuma migração ou reescrita histórica, mudança de hash/chave, de atraso, frontend ou dependências.

## Evidências locais

- Antes: quatro testes unitários executados, oito falhas em subcenários de offset/descrição/horário de verão (`.data/tests-3b2b-before.log`).
- Após: cinco testes focados aprovados, 3,692s (`.data/tests-3b2b-focused.log`): quatro unitários e um com PostgreSQL privado. Casos de offset equivalente, omitido/null/explicitado, meia-noite, horário de verão histórico, horário legado sem offset e retorno antecipado dos recibos.
- PostgreSQL: sessões UTC/São Paulo/Tóquio verificadas explicitamente; nove cobranças com datas/descrições persistidas e repetição sem duplicação, conflito com payload alterado, histórico simulado preservado com mesma versão. Fixture isolada migrada até head e removida ao final. Isso não é prova de interface.
- Imagem API construída (`.data/docker-build-3b2b.log`). Backups originais `pre-3B-2B*` preservados; helper `.data/upgrade_3b2b.py` somente `after` daqui em diante.

## Aceite integrado

Novo ensaio HTTP `scripts/smoke_financial_clinic_date_homolog.py` inicia API/schema privados em três fusos de sessão via PGTZ, confere `SHOW TimeZone` pela engine da API e verifica datas/descrições, vencimento explícito, persistência, repetição e histórico. Incluído no CI. Logs `.data/http-3b2b.log`; relatórios `.data/homolog/last-financial-clinic-date-*.json`.

Primeiro ensaio HTTP falhou com 409: a fixture reutilizava o mesmo paciente no mesmo instante nos três cenários, violando corretamente a regra de conflito da agenda. Corrigida somente a fixture para pacientes distintos; log final `.data/http-3b2b-final.log`. Implementação inicial `4a11420`; CI inicial substituído após ajuste do ensaio.

- HTTP final aprovado em UTC/São Paulo/Tóquio (`.data/http-3b2b-final.log`); três schemas privados removidos. São nove criações HTTP no total, com conferência via API e SQL.
- Regressão Chrome aprovada (`.data/browser-generation-3b2b.log`): sessões independentes, referências estáveis/rascunho, recuperação de falha, janela, cancelamento/reabertura e resposta perdida recuperada com chave/payload originais após exclusão real da consulta e referência 403. Uma cobrança, duas requisições explícitas. Capturas claro/escuro inspecionadas. A conversão dos três fusos SQL foi provada pelo ensaio HTTP, não por esta regressão visual.
- Auditorias npm/Python e seis imagens sem achados (`.data/audit-dependencies-3b2b.log`, `.data/audit-images-3b2b.log`).
- Somente API atualizada, web reutilizada; HTTPS/assets/dez verificações e preservação de linhas/referências/bytes dos exames aprovados (`.data/api-update-3b2b.log`, `.data/https-3b2b.log`, `.data/smoke-main-3b2b.log`, `.data/preservation-3b2b.log`). Revisão `0024_user_version`, zero schemas temporários; nenhum volume removido.
- Implementação `4a11420`, fixture `33acb37`, publicados e remoto conferido. [CI final 38728715724](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/38728715724) aprovado: 307 backend/379 frontend, HTTP (incluindo o novo ensaio), builds e auditorias. Inicial `38728548378` cancelado/superado. Log `.data/ci-final-3b2b.log`. A suíte completa foi executada pelo CI; localmente foram executados os testes focados e integrados acima.

3B.2C (atraso pelo dia clínico) fica adiada para priorizar o [piloto de cadastros](./PLANO-PILOTO-CADASTROS.md); não encerrar R20 nesta entrega. Não repetir validações, backups ou atualização aprovados sem mudança/falha.

## Retomada

**Sequência técnica adiada: 3B.2C — atraso pelo dia clínico**, conforme [contrato](./plano-etapa-3B-2.md). Reproduzir resumo e indicador com relógio fixo antes/depois da meia-noite em fusos de processo distintos; adotar uma amostra do dia por operação. Preservar status, versões, totais e histórico. Não repetir 3B.2B ou backups/atualização aprovados sem mudança/falha. Instantes/calendário e instalação assistida mantêm recortes próprios.
