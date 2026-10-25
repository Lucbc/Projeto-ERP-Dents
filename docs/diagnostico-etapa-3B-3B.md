# 3B.3B — reprodução integrada do fuso da agenda

## Estado

25/10/2026, base funcional `f3d4516`. **Preparação concluída; correção pendente.** Realizada enquanto o CI final da 3B.3A estava em execução. Aproveita o inventário da [3B.3A](./homologacao-etapa-3B-3A.md), sem repetir revisão geral. Não muda produto, banco, imagens ou escopo liberado.

## Reprodução em Chrome/API/SQL

Scripts `diagnose_appointment_timezone_homolog.py` e `.cjs`, dados fictícios em API/schema privados de `erp-dents-homolog`. Fixture criada pela API: início `2020-01-08T01:30:00Z`, fim `2020-01-08T02:30:00Z`. Isso corresponde a 07/01, 22h30–23h30 na clínica. Relógio fixo somente no navegador, para abrir a semana histórica; servidor inalterado.

| Fuso do navegador | Lista e campos dos dois editores | Coluna/posição do evento na semana | Filtro 07/01 encontra a consulta? |
| --- | --- | --- | --- |
| São Paulo | 07/01, 22h30–23h30 | Terça, 22h30 | Sim |
| UTC | 08/01, 01h30–02h30 | Quarta, 01h30 | Não |
| Tóquio | 08/01, 10h30–11h30 | Quarta, 10h30 | Não |

Posição conferida pelo índice da coluna e percentual vertical do evento no DOM renderizado, com tolerância de 0,1 ponto percentual; não é inspeção humana de captura. Campos reais abertos pela lista e pelo evento do calendário. Filtro enviado pela interface, resposta HTTP 200 real e presença/ausência do identificador confirmadas no corpo da API.

| Fuso | Limite inicial enviado | Limite final enviado |
| --- | --- | --- |
| São Paulo | `2020-01-07T03:00:00.000Z` | `2020-01-08T02:59:59.000Z` |
| UTC | `2020-01-07T00:00:00.000Z` | `2020-01-07T23:59:59.000Z` |
| Tóquio | `2020-01-06T15:00:00.000Z` | `2020-01-07T14:59:59.000Z` |

Zero POST/PUT/PATCH/DELETE de consultas pelo navegador. Snapshot SQL completo da consulta idêntico antes/depois. Bootstrap, reinício e limpeza privados aprovados; volumes originais preservados. Evidência local: `.data/appointment-timezone-diagnosis.log`.

Os scripts esperam o comportamento antigo para documentar o defeito. **Não usá-los como aceite de uma futura correção:** após corrigir, os três fusos devem produzir o resultado clínico, e as expectativas precisam refletir esse contrato.

## Próxima implementação

- Converter entrada, exibição, duração e filtros para `America/Sao_Paulo`, preservando a precisão original entregue na 3B.3A.
- Tratar calendário como parte do mesmo contrato: posição, seleção/criação/edição, dia/semana/mês, navegação e Hoje. Evitar apenas mudar o texto do evento.
- Garantir filtros de dia completo, incluindo frações no último segundo. O limite atual termina em `23:59:59` e a API compara `<=`; esse limite foi identificado no código, mas a perda de uma consulta fracionária no fim do dia ainda precisa de reprodução própria.
- Cobrir históricos de horário de verão, horários inexistentes/ambíguos, passagem de dia e consumidores compartilhados do financeiro, painel, Consulta e exames. Não aplicar offset fixo `-03:00` a todos os históricos.
- Aceite da correção: criar → abrir em outro fuso → reagendar → cancelar, verificando instantes na API/SQL, disponibilidade/concorrência e regressão de cadastros. Esta preparação só verificou leitura, edição aberta sem salvar e filtro; não cobre esses percursos de gravação.

R20 permanece aberto. R21/contrato de offset da API mantém seu recorte. Instalação física P3 interrompe a fila de melhorias quando chegarem os dados do servidor.
