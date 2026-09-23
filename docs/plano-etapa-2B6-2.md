# 2B.6.2 — exclusão de consultas na lista e calendário

Preparação em 23/09/2026, base `0f17b82`. Complementa [2B.6](./plano-etapa-2B6.md). Mapa/evidência abaixo registram o comportamento anterior. Implementação e validação da 2B.6.2.1 no [relatório próprio](./homologacao-etapa-2B6-2-1.md).

## Mapa do fluxo

- `appointments_router.py`: DELETE exige `appointments.delete`, recebe ID sem versão. Caso de uso e porta/repositório encaminham somente ID.
- `appointment_repository.py`: carrega consulta, exclui e confirma. Edição já compara/incrementa versão, mas a exclusão ignora a versão vista pelo usuário. Procedimentos associados são removidos; pacientes, dentistas e procedimentos do catálogo permanecem.
- `appointments-page.tsx`: confirmação genérica; envia ID da linha. `calendar-page.tsx`: envia ID de `editingAppointment`; confirmação não identifica paciente/horário e convive com campos editados ainda não salvos. Sucesso fecha e limpa o formulário; falha apenas mostra mensagem.
- `services.ts`: `appointmentService.remove(id)` não envia precondição. Lista/calendário usam consultas de cache da agenda; financeiro também pode exibir a consulta como origem ou vínculo atual.
- Banco: `appointment_procedures` usa CASCADE; `financial_entries.appointment_id` usa SET NULL. As capturas da `0021` são independentes; exclusão da consulta não exclui lançamento nem pagamento.
- `generate_from_appointment`: verifica recibo da chave **antes** de procurar a consulta. Reenvio de operação já confirmada pode recuperar o lançamento mesmo após exclusão da consulta. Uma chave nova exige consulta existente. Preservar essa ordem.

## Evidência da preparação

Probe local `.data/probe_appointment_deletion_2b62.py`, usando API/schema descartáveis de `erp-dents-homolog`. Dois cenários: geração pendente e geração paga. Criar consulta versão 1, gerar cobrança com chave, editar consulta para concluída/versão 2 e excluir com versão 1; conferir ausência da consulta, remoção de seus procedimentos, permanência do financeiro/histórico, recuperação pela chave antiga e rejeição de chave nova.

A sequência representa edição e geração já confirmadas antes da exclusão antiga; não equivale a uma disputa simultânea. **Ambos os cenários confirmados:** DELETE antigo retornou 204, consulta concluída desapareceu e seus links de procedimentos foram removidos; cobrança manteve valor/status/versão, captura de origem e pagamentos, com vínculo atual nulo. Chave antiga recuperou o mesmo lançamento; chave nova retornou 404. Nove grupos do harness incluindo preparação/limpeza; log `.data/appointment-deletion-2b62-probe.log`.

Interface e ordem de bloqueios foram inspecionadas no código; esta preparação não executou Chrome nem testes de concorrência PostgreSQL por barreira. Os resultados confirmam o defeito e as garantias a preservar, não a correção. Não adicionar ao CI um teste que exija a aceitação da versão antiga.

Após limpeza: zero schemas descartáveis, principal em `0021_financial_references`; comparação confirmou todas as linhas de negócio, referências históricas e bytes de exames preservados. Nenhum reinício/migração ou mudança executável. Última regressão permanece [CI 35874815267](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35874815267), 202 backend/69 frontend, não repetida para documentação.

## Contrato da próxima implementação (2B.6.2.1)

### Precondição e efeitos

1. DELETE exige `version` inteira positiva em query: 422 se ausente/inválida, 404 se consulta ausente, 409 `stale_version` se alterada. Comparar e excluir na mesma transação, com estado atualizado sob bloqueio; jamais GET/checagem seguida de DELETE incondicional fora da transação.
2. Comparar versão antes de remover qualquer procedimento associado. Em falha, consulta, links e referências devem permanecer íntegros. Exclusão permitida continua liberando o horário; não cancela automaticamente cobranças, pagamentos ou registros de estorno.
3. Manter as regras clínicas atuais. Hoje a exclusão não depende do status; a proteção técnica não introduz proibição por consulta concluída/cancelada nem transforma exclusão em cancelamento. Uma política clínica mais restritiva exige recorte próprio, não deve surgir como efeito colateral.
4. A versão representa a consulta e suas alterações pela agenda. Geração/baixa financeira não aumenta essa versão. Não anunciar que a precondição representa todos os estados financeiros; informar o efeito invariável: **“Excluir esta consulta não cancela cobranças nem pagamentos já registrados.”**
5. Somente o vínculo atual `appointment_id` é desfeito no financeiro. Preservar valores, status, versões financeiras, pagamentos, estornos, autores, referências históricas e recibos. Não atualizar versões financeiras artificialmente como parte desta correção; comportamento das FKs permanece explícito.
6. Manter `appointments.delete` como autorização. Não exigir `financial.view`/`financial.delete` para excluir consulta, nem expor valores ou dados financeiros na confirmação a quem não pode consultá-los. O aviso geral de efeitos não precisa consultar o financeiro.

### Confirmação e recuperação nas duas telas

- Mostrar paciente e data/horário da **consulta salva** que motivou o clique, guardando ID/versão junto da confirmação. Não buscar automaticamente a versão mais nova para executar uma exclusão antiga.
- Lista: confirmar a linha exibida; durante envio e após erro, impedir nova exclusão até conferir o estado atual. Recarregar explicitamente, revisar e confirmar novamente.
- Calendário: usar `editingAppointment`, não valores ainda não salvos de paciente/horário do formulário. Se houver rascunho, deixar claro que ele não será aplicado pela exclusão. Falha não fecha a janela nem descarta o rascunho.
- Recarga no calendário que substitua os campos exige ação explícita, com rótulo como “Descartar rascunho e carregar consulta atual”. Não trocar somente a versão mantendo um rascunho apresentado como se fosse o registro salvo. Após a revisão, uma nova exclusão exige outra confirmação.
- Consulta ausente: informar ausência atual e permitir fechar/atualizar a agenda, sem atribuir a exclusão ao usuário atual. Rede/5xx: resultado incerto, conferir estado antes de nova ação, sem reenvio automático nem mensagem de sucesso presumido.
- Em sucesso, atualizar consultas de lista/calendário e invalidar consultas financeiras que mostrem o vínculo atual. Não apagar capturas históricas do cache como se a cobrança tivesse sido excluída. Falha não deve limpar campos de outra consulta selecionada.
- Reutilizar comportamento testado dos catálogos quando aplicável, mas não assumir que recarregar a lista substitui corretamente o alvo/rascunho do calendário.

### Disputas financeiras e bloqueios

Excluir consulta pode bloquear lançamentos para aplicar SET NULL; baixa bloqueia lançamento e a captura tenta bloquear consulta. A `0021` usa bloqueios compartilhados não bloqueantes para evitar espera em ordem inversa. Preservar rollback e respostas seguras de conflito; não introduzir repetição automática de uma ação destrutiva.

Geração/criação financeira e exclusão **podem ambas ter sucesso** quando a cobrança confirma primeiro: a exclusão posterior desfaz o vínculo atual, conservando a origem. Isso não é o mesmo contrato de um PUT e DELETE disputando a mesma versão da consulta.

Se a exclusão confirmar primeiro, nova cobrança com aquele ID não pode ser gravada sem referência válida: falha de existência/FK/contenção deve reverter lançamento, captura, pagamento e recibo juntos. Reenvio de chave já confirmada recupera a operação anterior; não exige ressuscitar a consulta. Testar geração e criação manual vinculada, pendentes e pagas.

Na baixa de lançamento já existente, se a exclusão ocorrer antes da captura do pagamento, a referência atual à consulta poderá estar ausente; a origem do lançamento continua preservada. Não fabricar a referência do pagamento copiando silenciosamente a origem. Se a baixa confirmar antes, preservar exatamente sua captura quando a consulta for excluída depois.

## Matriz de aceite

| Camada | Critério |
| --- | --- |
| Banco/repositório | PUT × DELETE com mesma versão: um vencedor; DELETE × DELETE: uma exclusão; alvo carregado antes da edição não usa estado antigo do ORM; falha preserva links e horário |
| Estados | Consulta agendada/concluída/cancelada mantém política vigente; agenda libera horário apenas após exclusão confirmada; adjacências/conflitos anteriores não regridem |
| Financeiro | Cobrança pendente/paga permanece, FK atual nula e capturas/recibos intactos; chave antiga recupera, chave nova não gera após ausência |
| Concorrência financeira | Exclusão × geração/criação manual/baixa, com conexões independentes e barreiras; sem pagamento/recibo parcial, deadlock não vira 500 nem reenvio automático |
| API | Versão obrigatória/positiva, 404/409 distintos, autorização e revogação; usuário sem acesso financeiro recebe somente informações de agenda e aviso geral |
| Componentes | Confirmação mantém ID/versão; nome/horário da consulta salva; rascunho não é descartado em erro; recarga explícita exige nova confirmação; rede/404 corretos |
| Chrome | Lista × calendário em duas abas, reagendamento antes da exclusão, rascunho diferente do salvo, recuperação/ausência; cobrança preservada conferida por API autorizada |
| Entrega | Adaptar API/portas/use case/repositório/services/telas/testes/smokes juntos; cópias e preservação; builds/regressão/CI; commit/push e HEAD remoto |

Não precisa de nova coluna de versão. Não atualizar principal antes de cópias e aprovação focada. Limites: exclusões de dentistas/pacientes/exames, auditoria clínica completa, geração a partir de consulta cancelada, composição financeira por itens e disponibilidade entre recursos permanecem em seus recortes. Preservar o código já aprovado da 2B.6.1.
