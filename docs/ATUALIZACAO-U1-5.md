# U1.5 — busca por nomes sem distinguir acentos

Concluída em 16/10/2026, base `877f77a`, código `95d0666`. Liberada na versão `piloto-cadastros-v0.1.5`.

## Comportamento e limites

- Nome completo e nome social/preferido passam a comparar também uma forma sem acentos: `Joao` encontra `João` e `José` encontra `Jose`, sem distinguir maiúsculas/minúsculas.
- Normalização Unicode NFD e remoção de marcas U+0300–U+036F somente durante a consulta. Grafia, versões e datas dos registros permanecem intactas; CPF, telefone e demais campos mantêm suas regras anteriores.
- Formas compostas e decompostas de acentos são equivalentes. Não é busca aproximada nem transliteração de todos os alfabetos; letras como `ø` e `ß` não viram `o` e `ss`. Não há deduplicação automática.
- Sem extensão, migração, dependência ou mudança de configuração. Usa a função [normalize do PostgreSQL](https://www.postgresql.org/docs/16/functions-string.html), disponível no banco UTF-8 do projeto. Busca continua por trecho; desempenho em grandes bases não foi dimensionado.
- Termo formado apenas por marcas removidas não acrescenta uma condição que selecionaria todos os nomes. As condições originais de busca são preservadas.

## Validação

- Reprodução com imagem anterior: oito variações não encontraram os três registros equivalentes esperados. Log local ignorado `.data/accent-search-before.log`.
- PostgreSQL com schema exclusivo de `erp-dents-homolog`: dois testes aprovados em 5,356 s, cobrindo nomes com/sem acento, Unicode decomposto, maiúsculas, espaços, trechos, contagem/páginas, negativos e preservação de nomes/versões/datas. Regressões CPF, telefone e outros campos aprovadas no mesmo arquivo. Log `.data/accent-search-db.log`.
- Imagem API construída, log `.data/accent-search-build.log`. Isso não atualiza os containers principais nem comprova interface.
- Chrome/API aprovado: conta de recepção localiza as grafias equivalentes, confere ID e nomes originais, paginação, buscas CPF/telefone, cadastro sem CPF, conflito e reabertura. Log `.data/accent-search-browser.log`; recursos privados limpos e origem preservada. [CI 38989240918](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/38989240918) aprovado: 310 testes backend, 393 frontend, builds, regressões HTTP e auditorias. Log ignorado `.data/accent-search-ci.log`.

## Retomada

Guias e versão de instalação atualizados. Sem novo ensaio de instalação vazia ou troca de imagens nesta entrega: infraestrutura, esquema e frontend não mudaram; evidências anteriores continuam identificadas como anteriores. Não repetir ensaios aprovados sem mudança ou falha. Priorizar instalação física P3 quando chegarem os dados do computador da clínica.
