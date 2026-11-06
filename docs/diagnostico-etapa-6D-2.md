# 6D.2.1 — diagnóstico visual histórico/multidia

Data: 06/11/2026. Produto examinado: v0.1.27, base `6f815a2`. **Diagnóstico concluído; aceite ampliado de 6D.2 reprovado, correção pendente.**

## Ensaio e separação das evidências

- Recursos privados de `erp-dents-homolog`, dados fictícios. Preparação de paciente/dentista/consulta via API; intervalos históricos ajustados via SQL no esquema descartável. Isso não comprova que as regras atuais de disponibilidade autorizam criar consultas multidia.
- Três fixtures: 04/11/2018 (dia de 23 horas), 16/02/2019 (hora repetida no dia de 25 horas) e 07–10/03/2020 (três dias, término exclusivo à meia-noite).
- **Chrome inicial:** 36 combinações de três fixtures × dia/semana/mês × São Paulo/UTC/Tóquio/Nova York. Eventos presentes, editor conserva os valores locais originais; nenhuma escrita de consulta. Presença não equivale a posicionamento correto.
- **HTTP/SQL:** primeira execução confirmou leitura e igualdade integral das linhas antes/depois do navegador; bootstrap, reinício e limpeza passaram. Ensaio ampliado também confere os instantes retornados pela API, mas falhou no navegador antes de atingir a comparação SQL final.
- **Aceite ampliado:** compara geometria entre estações, três dias ocupados no mês, continuação entre semanas e término exclusivo na visão diária. Passou esses cenários em São Paulo, UTC e Tóquio; reprovou no primeiro cenário de Nova York. Não declarar os demais aceites ampliados de Nova York aprovados.
- Capturas de São Paulo inspecionadas: semana/dia de 23 horas, semana da hora repetida e mês multidia. Evidências locais ignoradas pelo Git: `.data/calendar-history.log`, `.data/calendar-history-acceptance.log`, `.data/homolog/calendar-history.json` e `calendar-history-*.png`.

## Falha reproduzida

Na semana de 29/10–04/11/2018, evento clínico de 10:00–11:00 de domingo:

| Fuso da estação | Posição vertical | Altura | Coluna |
|---|---:|---:|---:|
| São Paulo, UTC, Tóquio | 39,1304% | 4,34783% | domingo |
| Nova York | 34,7826% | 4,34783% | domingo |

A diferença corresponde a uma hora na escala de 23 horas. Título/editor mantêm 10:00–11:00; não houve alteração dos instantes persistidos na primeira execução.

Inspeção do código instalado: `TimeSlots.positionFromDate` soma `localizer.getDstOffset` à diferença em minutos. O adaptador Luxon não sobrescreve esse método; o fallback de `localizer.js` usa `Date.getTimezoneOffset()` do computador. O adaptador clínico já calcula diferenças em São Paulo, mas ainda herda essa compensação externa. Esta é a causa candidata sustentada pelo código e pela diferença entre fusos; a correção precisa passar no mesmo ensaio.

Outro limite visual observado: a hora repetida aparece como **23:30–23:30**, embora os instantes estejam separados por uma hora. Não é perda de duração no banco; falta distinguir os offsets ou a duração na apresentação histórica. Não confundir isso com a falha de posicionamento acima.

## Retomada 6D.2.2

1. Corrigir a compensação de fuso do computador no adaptador clínico, sem mudar instantes nem fuso global.
2. Acrescentar regressão focal que falhe no fallback atual e passe na correção; executar novamente este harness e o aceite cotidiano de quatro fusos.
3. Conferir seleção de horários nos dias históricos e a apresentação da hora repetida, antes de encerrar o escopo histórico.
4. Executar suíte/build/CI e regressões necessárias antes de publicar outra versão de instalação. Atualizar os guias somente se o produto aprovado mudar.

Harness: `scripts/smoke_calendar_history_homolog.py`, usando o mesmo `PLAYWRIGHT_MODULE` dos demais ensaios. O teste atualmente deve reprovar no estágio `America/New_York short-day week cross-zone geometry`.

Nenhuma alteração de aplicação, imagem, migração ou roteiro de instalação nesta entrega. v0.1.27 preservada; containers e volumes principais não foram reiniciados/removidos. P3 físico continua prioritário e odontograma permanece no plano posterior.
