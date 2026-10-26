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

## Base de conversão 3B.3B.1 — 25/10/2026

Base `ee7f60f`. Módulo `apps/web/src/lib/clinic-time.ts`, ainda sem importação pelos componentes de produção. Não substitui parcialmente os conversores existentes. **Aceites locais da base concluídos; integração 3B.3B.2 pendente.** Instalação permanece `piloto-cadastros-v0.1.20`, sem nova tag, dependência, API, schema, configuração ou build Docker necessário.

Contrato:

- `toClinicInput` aceita instante ISO com offset explícito e produz campo `YYYY-MM-DDTHH:mm` em São Paulo; rejeita datas impossíveis/instantes sem offset. Os limites de ano são 0001–9999, compatíveis com os formulários/API.
- `resolveClinicInput` devolve sucesso com ISO ou motivo explícito (`invalid`, `invalid-original`, `nonexistent`, `ambiguous`). Na ambiguidade, devolve as alternativas em ordem cronológica; não escolhe silenciosamente.
- Se o horário clínico exibido não mudou, devolve a string original exata, incluindo offset, segundos e microssegundos. Isso preserva também a escolha original dentro de uma hora repetida. Um horário diferente não herda essa escolha automaticamente.
- Offsets derivados do Intl/IANA nas proximidades da data, com conferência da conversão de volta. Algoritmo limitado às regras de São Paulo; não é um resolvedor genérico de fusos. Inclui offset histórico com segundos e não fixa UTC-03. Referência: [dados IANA para América do Sul](https://data.iana.org/time-zones/tzdb/southamerica).

Validação:

- 50 testes semânticos executados em processos Node separados com `TZ=America/Sao_Paulo`, `UTC` e `Asia/Tokyo`: 150 execuções aprovadas. Logs `.data/clinic-time-America-Sao_Paulo.log`, `.data/clinic-time-UTC.log`, `.data/clinic-time-Asia-Tokyo.log`.
- Cobertura: offsets equivalentes, troca de dia/ano, bissexto, datas/horas inválidas, lacuna de 2018, repetição de 2019, histórico anterior a 1914, anos abaixo de 100, limites de ano e preservação exata de microssegundos.
- `scripts/check_clinic_time_browser.cjs` compila o módulo real em memória e verifica conversão, lacuna, ambiguidade, preservação, alteração e offset histórico em Chrome nos mesmos três fusos. `.data/clinic-time-browser.log`. **Teste do utilitário no motor do navegador; não é aceite de tela, API ou SQL.** Nenhum servidor, credencial ou dado persistente usado.
- TypeScript/build aprovado (`.data/clinic-time-build.log`); aviso já existente de tamanho de chunk. Sem mudança nos consumidores, não repetir os percursos integrados da 3B.3A nesta subetapa.

Próximo 3B.3B.2: ligar consumidores e calendário em conjunto, usando erros explícitos nos formulários; implementar limites de dia completo e duração. Escolher integração do calendário que opere no mesmo fuso também na aritmética, posição e seleção. Os testes de diagnóstico acima ainda esperam o defeito e devem ser substituídos por aceites clínicos na integração. CI desta base deve ser conferido antes de promover uma futura versão de instalação.
