# 6D.2.2 — compensação de fuso na agenda

Início: 06/11/2026, base `1c487b3`. **Em validação; instalação v0.1.27 mantida.**

## Mudança

- O adaptador clínico deixa de somar o ajuste de horário de verão do computador aos minutos já calculados por Luxon em São Paulo. Sem mudança de instantes, disponibilidade, banco ou fuso global.
- Intervalos com offsets clínicos diferentes mostram ambos os offsets no rótulo de horário; o editor informa o intervalo original e sua preservação quando os campos não forem alterados. Intervalos cotidianos conservam o formato simples.

## Evidência inicial e critérios de aceite

- Regressão focal reproduziu 480 em vez dos 540 minutos esperados ao simular a mudança de offset de Nova York; passou após a correção. Não depende do fuso do processo de testes.
- Aceites pendentes: suíte frontend/build, Chrome/API/SQL histórico (36 visualizações, segmentos e término exclusivo, seleção de 12h, rótulo/editor da hora repetida), regressão cotidiana em quatro fusos, cadastros e CI.
- Scripts integrados usam somente recursos privados de `erp-dents-homolog` e dados fictícios; não reiniciar containers principais ou remover volumes.
- Publicar próxima tag/guias apenas depois dos aceites. Histórico do diagnóstico em [6D.2.1](./diagnostico-etapa-6D-2.md).
