# 3B.1 — apresentação de datas civis

Início em 14/10/2026, base `453c79a`. **Concluída em 14/10/2026.** [Contrato e próximos recortes](./plano-etapa-3B.md). R20 permanece aberto.

## Alteração

`formatDate` agora recebe exclusivamente data civil ISO `YYYY-MM-DD`, valida calendário gregoriano e apresenta `DD/MM/YYYY` sem criar instante. Nascimento em Pacientes/Consulta usa esse utilitário; vencimento exibido no Financeiro passou a usá-lo também. Ausência ou valor inválido apresenta `-`, sem normalizar dias impossíveis. Ano zero, formato incompleto e instantes são rejeitados. Sem alteração de API, schema, dados persistidos, conversores de horário ou vencimento padrão.

## Evidências locais

- Antes da correção: 19 falhas/3 aprovações nos 22 casos de data civil, em São Paulo (`.data/tests-3b1-before.log`). Inclui nascimento deslocado e aceitação indevida de datas inválidas.
- Após: 65 testes focados aprovados, incluindo os três consumidores e valores originais nos editores (`.data/tests-3b1-focused.log`).
- Suíte completa: 366 testes/42 arquivos, 83,57s (`.data/tests-3b1-full.log`); TypeScript/Vite aprovado, build Vite 27,10s (`.data/build-3b1.log`). Aviso preexistente de bundle acima de 500kB permanece.
- Imagem web construída (`.data/docker-build-3b1.log`). Backups originais `pre-3B-1*` preservados; helper local `.data/upgrade_3b1.py` somente `after` daqui em diante.

## Aceite integrado

Ensaio `scripts/smoke_civil_dates_browser_homolog.py` usa schema/API temporários em `erp-dents-homolog`, dados fictícios e Chrome em São Paulo/UTC/Tóquio. Deve provar nascimento em Pacientes/Consulta, vencimento no Financeiro, valores dos editores, ausência de escritas dos leitores e datas/versões inalteradas via API. Relatório `.data/homolog/last-civil-dates-browser.json`; log `.data/browser-3b1.log`.

- Chrome aprovado nos três fusos, captura de Consulta inspecionada: datas e versões mantidas via API, valores originais nos editores e nenhuma escrita dos leitores. API/schema temporários removidos.
- Auditorias npm/Python e seis imagens aprovadas (`.data/audit-dependencies-3b1.log`, `.data/audit-images-3b1.log`).
- Somente web da homologação atualizada: HTTPS confiável, assets iguais ao build, dez verificações integradas e preservação das linhas/referências/bytes dos exames aprovados (`.data/https-3b1.log`, `.data/smoke-main-3b1.log`, `.data/preservation-3b1.log`). Nenhum volume removido.
- Implementação `53f1e44` publicada e remoto conferido. [CI 38602968878](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/38602968878) aprovado: 366 frontend/302 backend, HTTP/builds/auditorias. Log `.data/ci-final-3b1.log`. Banco `0024_user_version`, zero schemas temporários. Backups originais mantidos; não repetir testes/aplicação/backups aprovados sem mudança ou falha.

R20 permanece aberto para dia clínico e instantes, tratados nos próximos recortes.

## Retomada

**Próximo: preparar 3B.2 — dia clínico no financeiro.** Delimitar vencimento manual, geração por consulta/descrição e cálculo de atraso, conforme [plano 3B](./plano-etapa-3B.md). Reproduzir antes/depois da meia-noite clínica, mesmo instante em offsets diferentes e vencimento explícito preservado; não alterar datas históricas. Não repetir a validação de 3B.1 sem mudança/falha. Instantes/calendário e contrato de offset continuam nos recortes seguintes; instalação assistida na etapa 5.
