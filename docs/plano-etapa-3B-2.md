# 3B.2 — dia clínico no financeiro

**Status atual: 3B.2A concluída; iniciar 3B.2B.** Preparação abaixo é histórica; fechamento e retomada ao final.

## Preparação 3B.2P — 14/10/2026

Base `4bc132e`, árvore inicialmente limpa. Início: conferir a implementação atual, reproduzir virada de dia e representações equivalentes de instantes, delimitar vencimento manual, geração e atraso. **Preparação concluída; implementação pendente.** Complementa o [plano 3B](./plano-etapa-3B.md). R20 permanece aberto.

## Evidências e limites

### Vencimento manual — expressão atual executada em Node

[financial-page.tsx](../apps/web/src/pages/financial/financial-page.tsx), `onNewEntry`, ainda usa `new Date().toISOString().slice(0, 10)`. Nos fusos de processo São Paulo, UTC e Tóquio, a expressão apresentou:

| Instante fixo | Padrão atual | Dia em São Paulo |
| --- | --- | --- |
| 2030-01-08T02:59:59Z | 2030-01-08 | 2030-01-07 |
| 2030-01-08T03:00:00Z | 2030-01-08 | 2030-01-08 |

É reprodução da expressão, sem montar formulário. A exibição civil corrigida em 3B.1 permanece válida; o defeito é a escolha do valor inicial.

### Geração — caso de uso real com repositórios simulados

Executado `FinancialUseCases.generate_from_appointment`, incluindo normalização, no processo Python da API de **homologação**. Repositórios simulados em memória; nenhum acesso ou escrita de dados pelo caso de uso. Mesmo instante fictício em três offsets:

| `start_at` recebido | Vencimento implícito atual | Sufixo da descrição atual |
| --- | --- | --- |
| 2030-01-08T01:30:00+00:00 | 2030-01-08 | 08/01/2030 01:30 |
| 2030-01-07T22:30:00-03:00 | 2030-01-07 | 07/01/2030 22:30 |
| 2030-01-08T10:30:00+09:00 | 2030-01-08 | 08/01/2030 10:30 |

Todos correspondem a **07/01/2030 22:30 em São Paulo**. Vencimento explícito `2030-02-10` foi preservado nos três cenários. Código: [financial_use_cases.py](../apps/api/src/core/use_cases/financial_use_cases.py), extração direta por `.date()`/`.strftime()`.

Consulta somente de leitura `SHOW timezone` retornou `America/Sao_Paulo` no PostgreSQL de homologação. Portanto a divergência demonstrada no caso de uso **não prova que a geração integrada esteja errada nessa configuração atual**. É dependência do fuso de representação do objeto, que precisa ser removida e validada também com sessões SQL em fusos distintos. A engine em [database.py](../apps/api/src/adapters/db/database.py) não fixa explicitamente esse fuso.

### Atraso — resumo real com sessão e relógio simulados

Executado `SqlAlchemyFinancialRepository.summarize` com retorno de sessão simulado: receita pendente de 12000 centavos, vencimento `2030-01-07`; instante fixo `2030-01-08T02:59:59Z`. O `date.today()` do módulo foi simulado com o dia correspondente a cada fuso do processo:

| Dia do processo | Total vencido atual |
| --- | --- |
| São Paulo: 2030-01-07 | 0 |
| UTC/Tóquio: 2030-01-08 | 12000 |

O dia clínico ainda é 7 de janeiro; a cobrança não deve estar atrasada. Isso demonstra dependência do relógio local no método, sem alterar relógio/configuração do servidor. `is_overdue` também usa `date.today()` em [_to_entity](../apps/api/src/adapters/db/repositories/financial_repository.py), identificado por inspeção; ainda requer teste específico. Homologação configura TZ São Paulo, portanto não foi demonstrado erro corrente de atraso nesse servidor.

## Contrato

- Usar `America/Sao_Paulo`, já adotado pela disponibilidade. Centralizar o identificador por camada; não introduzir configuração multi-clínica nesta etapa nem fixar offset `-03:00` para todas as épocas.
- Vencimento manual: sugerir o dia clínico **ao abrir uma nova ação**. Preservar escolha do usuário durante atualização de referências, polling ou passagem da meia-noite; reabrir uma nova ação recalcula o padrão. Edição mantém o vencimento salvo.
- Geração: calcular data e texto da consulta no fuso clínico. Vencimento explícito prevalece; ausência/null mantém o contrato atual de derivar da consulta. Não recalcular cobranças já emitidas.
- Idempotência: retorno de operação já registrada precede o novo cálculo. Não mudar hash/chave/payload nem descrição/vencimento histórico ao repetir operação incerta, inclusive após exclusão da consulta ou perda de acesso à referência.
- Atraso: somente pendente com vencimento estritamente anterior ao dia clínico. Vencimento hoje não está atrasado; pago/cancelado não vira vencido. Receitas e despesas mantêm a composição atual do resumo.
- Amostrar o dia uma vez por operação de leitura, evitando que linhas de uma mesma lista usem dias diferentes ao atravessar meia-noite. Lista e resumo são requisições independentes: podem refletir lados diferentes da virada; não prometer uma transação comum entre elas.
- Relógio correto continua sendo requisito de operação. Converter o fuso não corrige relógio incorreto de uma estação; sincronização/configuração operacional permanece no roteiro de instalação. Nesta etapa o frontend usa seu relógio para sugerir a data, sem criar endpoint de horário.

## Recortes de implementação e aceite

### 3B.2A — vencimento sugerido no formulário

Primeiro recorte. Criar utilitário de dia clínico com instante injetável para teste e usar somente em `onNewEntry`. Reproduzir o erro em componente antes de corrigir. Cobrir antes/depois da meia-noite, virada de mês/ano, bissexto e histórico de horário de verão com fuso IANA. Verificar São Paulo/UTC/Tóquio, escolha manual preservada, fechamento/reabertura e edição sem mudança. Chrome com relógio fixo deve provar o campo e o payload de uma gravação explícita; API deve devolver a mesma data. Não alterar gerador, atraso ou conversores de instantes neste recorte.

### 3B.2B — geração por consulta

Normalizar o instante ao fuso clínico antes de formar descrição/data. Reutilizar regra de fuso existente sem mudar silenciosamente o tratamento legado de horários sem offset. Testes unitários dos três offsets acima, explícito/omitido/null e instante na virada do dia. API/PostgreSQL em schema privado: executar com fusos de sessão diferentes, confirmar data/descrição persistidas e preservação de cobranças históricas. Repetição com mesma chave retorna o mesmo lançamento; mesma chave/payload alterado conserva rejeição. Regressão de resposta perdida e referência indisponível; não reabrir o contrato de pagamentos nesta etapa.

### 3B.2C — atraso pelo dia clínico

Definir relógio clínico no backend e usar em resumo/entidades, mantendo uma amostra por leitura. Testes com relógio fixo em ambos os lados da meia-noite e processo em fusos diferentes; ontem/hoje/amanhã, pendente/pago/cancelado, receita/despesa. API/banco: lista e resumo concordam para o mesmo instante fixo, sem atualizar status ou versões para marcar atraso. Chrome deve mostrar indicador e total coerentes; não mudar filtros ou tratamento de instantes da agenda.

### 3B.2D — fechamento

Consolidar provas por camada e limitações; regressões financeiras e preservação conforme mudanças. Encerrar 3B.2 somente após A/B/C aprovados. R20 segue para 3B.3 (instantes/calendário); R21/offsets e paginação mantêm recortes próprios.

## Validação e retomada

Preparação validada por inspeção, Node, métodos Python reais com dependências simuladas e leitura de configuração SQL. **Não houve teste HTTP novo, teste de persistência ou Chrome nesta preparação.** Nenhuma alteração funcional, migração, backup, rebuild, reinício ou escrita no banco. Última homologação funcional: [3B.1](./homologacao-etapa-3B-1.md), CI `38602968878` aprovado.

**Próximo: registrar início e implementar 3B.2A.** Reutilizar `financial-refresh.test.tsx` para prova de abertura/rascunho e harness Chrome privado; nunca alterar relógio do sistema ou usar dados reais. Atualizar web somente após build e aceite, com preservação conforme rotina. Publicar commit/push e verificar remoto. Não repetir a revisão geral nem testes de 3B.1 já aprovados sem mudança/falha.

## Fechamento 3B.2A — 14/10/2026

**3B.2A concluída em 14/10/2026**, implementação `14392a3`: novos lançamentos sugerem o dia da clínica em São Paulo; escolha do usuário e edição preservadas. 379 testes frontend/302 backend e CI `38614003801` aprovados; Chrome em três fusos com seis criações explícitas/payload/releitura API e nenhuma escrita automática. Auditorias, atualização somente web/HTTPS/dez verificações/preservação aprovadas; banco `0024_user_version`, zero schemas temporários. [Evidências](./homologacao-etapa-3B-2A.md). R20 permanece aberto.

**Próximo: iniciar 3B.2B — geração por consulta no fuso clínico**, conforme [contrato](./plano-etapa-3B-2.md). Reproduzir os três offsets equivalentes antes de corrigir data/descrição; preservar vencimento explícito, idempotência e cobranças históricas. Validar API/PostgreSQL com fusos de sessão distintos e recuperação de resposta perdida. Não repetir 3B.2A, backups ou atualização aprovados sem mudança/falha. Atraso permanece em 3B.2C; instantes e instalação assistida nos recortes próprios.
