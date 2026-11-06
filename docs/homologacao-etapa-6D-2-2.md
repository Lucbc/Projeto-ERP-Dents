# 6D.2.2 — compensação de fuso na agenda

Início e conclusão dos aceites: 06/11/2026, base `1c487b3`. **Aprovada no recorte descrito; v0.1.28 em publicação.**

## Mudança

- O adaptador clínico deixa de somar o ajuste de horário de verão do computador aos minutos já calculados por Luxon em São Paulo. Sem mudança de instantes, disponibilidade, banco ou fuso global.
- Intervalos com offsets clínicos diferentes mostram ambos os offsets no rótulo de horário; o editor informa o intervalo original e sua preservação quando os campos não forem alterados. Intervalos cotidianos conservam o formato simples.

## Evidência inicial e critérios de aceite

- Regressão focal reproduziu 480 em vez dos 540 minutos esperados ao simular a mudança de offset de Nova York; passou após a correção. Não depende do fuso do processo de testes.
- **Componentes/build aprovados:** 530 testes em 54 arquivos (63,89 s); imagem web reconstruída. Quatro testes acrescentados: compensação indevida, dois intervalos com mudança de offset e formato cotidiano. Warnings conhecidos de anotação de dependência e tamanho de bundle não impediram o build.
- **Chrome/API/SQL histórico aprovado:** 36 visualizações com geometria igual nos quatro fusos, segmentos de três dias, término exclusivo à meia-noite e continuação entre semanas. Seleção de 12:00–12:30 nos dois dias históricos em todos os fusos; aviso da hora repetida no editor. Zero escritas de consulta e igualdade integral das linhas no banco; bootstrap/reinício/limpeza privados aprovados. `.data/calendar-history-fixed.log` e `.data/homolog/calendar-history.json`. Captura da visão diária com offsets distintos inspecionada.
- **Chrome/API/SQL cotidiano aprovado:** lista/editor/filtros, navegação dia/mês e seleção; quatro criações e três reagendamentos/cancelamentos entre estações, conferidos no SQL. `.data/calendar-fix-appointment_timezone.log`.
- **Regressões Chrome/API/SQL aprovadas:** referências/conflitos de agenda, permissões 403, versão/disponibilidade 409, duração/rascunhos e seleção real por mouse; cadastros com CPF/nascimento/documentos históricos, busca, conflito, reabertura e limpeza explícita. Logs `.data/calendar-fix-calendar_references_browser.log` e `.data/calendar-fix-registration_pilot.log`. Bootstrap/reinício/limpeza privados aprovados.
- **[CI 42223686843](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/42223686843) aprovado: produto `aa7c8a6`, 530 frontend, 368 backend (567,658 s), builds/HTTP e seis imagens sem achados.** Log local `.data/calendar-ci-approved.log`.
- Scripts integrados usam somente recursos privados de `erp-dents-homolog` e dados fictícios; não reiniciar containers principais ou remover volumes.
- Aceites concluídos; tag/guias v0.1.28 em publicação. Histórico do diagnóstico em [6D.2.1](./diagnostico-etapa-6D-2.md).

## Limites

Fixtures históricas são preparadas por SQL privado; não ampliam a regra de disponibilidade nem autorizam criação de atendimentos multidia. A seleção validada nos dias históricos é a faixa de 12h; não há escolha explícita entre as duas ocorrências de uma hora repetida em novos agendamentos. A validação existente continua recusando novos horários ambíguos/inexistentes, preservando instantes originais ao editar outros campos. Não houve novo ensaio de instalação física, que continua dependente do checklist da clínica.
