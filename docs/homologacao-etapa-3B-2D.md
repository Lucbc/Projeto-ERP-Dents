# 3B.2D — consolidação do dia clínico no financeiro

## Critérios e evidências

| Parte | Comportamento validado | Referência |
| --- | --- | --- |
| 3B.2A | Novo lançamento sugere o dia de São Paulo; escolha do usuário e vencimento editado são preservados | [Relatório A](./homologacao-etapa-3B-2A.md), CI 38614003801 |
| 3B.2B | Geração por consulta usa data/descrição no fuso clínico; vencimento explícito e repetição idempotente preservam histórico | [Relatório B](./homologacao-etapa-3B-2B.md), CI 38728715724 |
| 3B.2C | Resumo e indicador de atraso usam o dia clínico; hoje não está vencido, pagos/cancelados excluídos do atraso, uma amostra por leitura | [Relatório C](./homologacao-etapa-3B-2C.md), CI final 40000877678 aprovado |

A/B não foram repetidas integralmente: evidências anteriores permanecem identificadas pela versão. A regressão financeira local de C inclui os testes de geração/data histórica em banco; o CI atual executa também o smoke HTTP de geração. Essa distinção evita apresentar testes antigos de interface como nova execução.

## Estado de fechamento

**3B.2 concluída em 23/10/2026.** Aceites locais e CI final de C aprovados; versão de instalação v0.1.19. CI: 328 backend, 427 frontend, builds/HTTP e auditorias aprovados, seis imagens sem achados após correção Nginx. Sem migração nesta etapa de fechamento. As correções não alteram vencimentos históricos nem transformam o indicador calculado em status persistido. Lista e resumo continuam sendo requisições independentes, sujeitas à virada da meia-noite entre elas.

## Próximo passo

3B.3 — instantes, entradas, filtros e calendário, conforme [plano 3B](./plano-etapa-3B.md). R20 continua aberto até concluir os consumidores de horários; R21/contrato de offset mantém seu recorte. Esta consolidação não libera financeiro/atendimento completos para uso clínico nem condiciona a instalação do piloto de cadastros a essas melhorias. P3 físico tem prioridade quando chegarem as informações do servidor.
