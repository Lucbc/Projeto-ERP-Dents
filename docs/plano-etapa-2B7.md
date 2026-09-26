# 2B.7 — disponibilidade de dentistas e agendamento

**2B.7 concluída:** validação de horários na [2B.7.1](./homologacao-etapa-2B7-1.md), implementação `b935d5f`; coordenação transacional e interface na [2B.7.2](./homologacao-etapa-2B7-2.md), implementação `6dbf767` e ajuste de testes `6170ee0`, concluída em 26/09/2026. Usuário escolheu bloquear alterações incompatíveis até reagendar/cancelar explicitamente. Os seis interleavings abaixo foram corrigidos e testados nas duas ordens. O diagnóstico original, base `71ad428`, é preservado como histórico.

## O que foi reproduzido

Probe local `.data/probe_availability_2b7.py`, usando a imagem atual e o fixture de concorrência: schema PostgreSQL próprio `test_agenda_*`, migração até head, dados fictícios e limpeza em `finally`/cleanup. Duas sessões independentes; após a validação da consulta e antes da escrita, a outra sessão altera/confirma o dentista. Interleaving determinístico, sem depender de temporizadores. Não é teste de carga ou duas requisições HTTP simultâneas.

| Operação da consulta | Mudança confirmada antes da escrita | Resultado atual |
| --- | --- | --- |
| Criação | Horário deixa de abranger a consulta | Consulta é criada fora da disponibilidade atual |
| Criação | Dentista inativado | Consulta é criada para dentista já inativo |
| Reagendamento | Horário novo deixa de caber; horário original ainda cabia | Reagendamento confirma fora da disponibilidade |
| Reagendamento | Dentista inativado | Reagendamento confirma mesmo assim |
| Reativação de consulta cancelada | Horário deixa de abranger a consulta | Consulta volta a agendada fora da disponibilidade |
| Reativação de consulta cancelada | Dentista inativado | Consulta volta a agendada para dentista inativo |

Em todos os seis casos a versão do dentista mudou para 2, ambas as escritas confirmaram e a leitura final em outra sessão demonstrou a incompatibilidade. A versão da consulta protege outra edição **da mesma consulta**, mas não a mudança no dentista.

Outros três diagnósticos:

1. Sequencial, no mesmo schema: criar consulta futura, esvaziar disponibilidade, tentar editar somente observação. Alteração do dentista é aceita; consulta permanece; observação é recusada pela disponibilidade atual. Cancelamento explícito ainda funciona.
2. Regra de domínio: consulta terminando às **10:30:59** é aceita em turno que termina às **10:30:00**, porque a comparação descarta segundos.
3. Schema de entrada: `DentistAvailabilitySlot` aceita **25:00–26:00**; regex confere apenas formato e ordenação textual. Verificado diretamente no schema instalado, sem chamada HTTP nem escrita de dado inválido na principal.

São **nove diagnósticos**: oito no probe (uma execução em 5,066s) e um teste direto do schema. Não adicionar teste permanente que espere esses defeitos.

## Causa identificada na preparação

- `AppointmentUseCases.create/update` lê dentista e valida antes de chamar o repositório. `SqlAlchemyAppointmentRepository.create/update` não relê nem bloqueia a disponibilidade para validar/escrever na mesma transação.
- Atualização de dentista compara sua própria versão; não verifica consultas existentes. Exclusion constraints da agenda impedem sobreposição entre consultas, mas não protegem o JSON de disponibilidade ou o campo `active` do dentista.
- `DentistAvailabilitySlot` e `_normalize_availability` precisam de uma regra coerente para horas reais. `_validate_dentist_availability` compara minutos truncados; usa `America/Sao_Paulo`, rejeita passagem de dia e ignora disponibilidade apenas para `cancelled`.
- UI de dentista envia disponibilidade/ativo mesmo em edição de outros campos e invalida `dentists`. Lista/calendário consultam dentistas em caches próprios; erros de criação apenas exibem mensagem, enquanto 409 em edição ativa conflito. A recuperação deve distinguir cadastro/consulta alterados de horário indisponível.
- `0021_financial_references` captura referências com `FOR SHARE NOWAIT`, começando pela consulta, depois paciente/dentista/procedimentos. Novos bloqueios devem manter falhas controladas e rollback; não reescrever pagamentos, recibos ou capturas.

## Decisão de negócio — confirmada pelo usuário na 2B.7.2

Foi perguntado como tratar consultas futuras quando o dentista é inativado ou seus horários são reduzidos:

- **Proposta recomendada:** recusar mudança incompatível até que o operador reagende ou cancele explicitamente as consultas afetadas. Nenhuma consulta é alterada automaticamente.
- Alternativa: conservar compromissos existentes e aplicar a nova disponibilidade somente a novas marcações/reagendamentos. Isso exige explicitar a exceção para consultas antigas e permitir manutenção sem transformar a edição em nova reserva.

**Resposta recebida:** bloquear a alteração até reagendar ou cancelar as consultas afetadas. A implementação da 2B.7.2 está autorizada com essa regra. As referências à resposta pendente nos registros da preparação são históricas.

Regra escolhida e implementada: compromissos `scheduled`/`confirmed` ainda não encerrados (`end_at` posterior ao instante de verificação), incluindo consultas em andamento; cancelados/concluídos e histórico não são cancelados, reagendados ou reclassificados implicitamente. Nome/cor/contato sem mudança efetiva de disponibilidade/ativo não ficam bloqueados por consultas legadas incompatíveis. A validação estrita dos horários enviados da 2B.7.1 permanece. Recorte temporal testado com relógio controlado, sem depender da data da execução.

## Contrato técnico independente da política

### 2B.7.1 — validação de horários

- Centralizar validação de dia e `HH:MM` real: hora 00–23, minuto 00–59, início menor que fim, mesma representação no schema/caso de uso. Não aceitar `24:00`, `25:00` ou minuto 60; não corrigir silenciosamente valores recebidos.
- Comparar instantes locais completos com limites do turno: 10:30:00 cabe no fim 10:30; 10:30:00.000001 não cabe. Preservar timezone atual, rejeição de consulta atravessando dia e duração positiva. Não arredondar dados históricos nem introduzir regra global de fuso nesta entrega.
- Manter política atual de intervalos separados: consulta deve caber em um intervalo; não unir turnos nem permitir atravessar pausa implicitamente. Duplicatas exatas continuam normalizadas como hoje. Férias/exceções por data ficam fora do recorte.
- Não migrar/regravar horários legados automaticamente. Identificar formato inválido por diagnóstico agregado, sem expor nomes/consultas; dados devem ser corrigidos explicitamente. Não bloquear leitura do histórico.
- Testar domínio e schemas, depois HTTP e formulário. Não apresentar essa entrega como solução da corrida transacional, que fica na 2B.7.2.

### 2B.7.2 — validação e escrita na mesma transação

- Criação, mudança de dentista/horário e reativação devem reler disponibilidade/ativo sob bloqueio que impeça alteração concorrente até o commit. Comparar estado atual, nunca uma entidade antiga do cache ORM.
- Definir coordenação no repositório/unidade transacional, sem depender apenas de leitura no caso de uso. Reutilizar regra pura de disponibilidade; não criar cópias divergentes no adaptador e domínio. Fazer rollback completo em toda falha, incluindo procedimentos vinculados.
- Avaliar bloqueio compartilhado do dentista (`FOR SHARE`) para consultas e bloqueio exclusivo para sua alteração. Não confundir com `FOR KEY SHARE`, que não basta para bloquear mudança de campos não chave. Não usar mutex em memória nem lock global de toda a agenda.
- Ordenar dentistas por UUID antes de bloquear a consulta em movimentações entre profissionais; reler/comparar versão após bloquear. Se leitura preliminar ficou antiga, rejeitar por versão, sem seguir com conjunto de locks incompleto. Testar movimentações opostas, exclusão de dentista/paciente/consulta e financeiro antes de fixar a estratégia final.
- Se a política recomendada for escolhida, atualização do dentista verifica compromissos incompatíveis sob o mesmo bloqueio, antes de confirmar disponibilidade/ativo. A consulta que confirmou primeiro deve ser vista por essa verificação; se a mudança do dentista confirmou primeiro, consulta nova incompatível deve ser recusada. Não impor um único vencedor quando as duas operações são compatíveis.
- Versão da consulta/dentista e exclusion constraints existentes continuam obrigatórias. Não permitir sobrescrita, sobreposição, migração destrutiva ou cancelamento/estorno implícito. Sem migração prevista neste momento; justificar qualquer necessidade descoberta na implementação.
- Manutenção de observações e transições clínicas de consultas antigas exige matriz explícita de campos/status antes de alterar o comportamento. Cancelamento deve continuar disponível. Não deixar histórico irremediavelmente sem manutenção porque o dentista mudou seus horários; não permitir que uma reativação use essa exceção para criar nova reserva inválida.

### API e interface

- Dados de horário inválidos: resposta de validação controlada. Incompatibilidade com estado atual: erro de domínio identificável, por exemplo 409 `availability_conflict`, sem SQL/dados clínicos. Distinguir conflito de versão; não afirmar que outra pessoa editou a consulta quando só o dentista mudou.
- Mensagem de bloqueio do dentista não pode expor nomes/detalhes de pacientes a quem não tem permissão de consultas. Não exigir permissões financeiras nem mudar perfis.
- Preservar rascunho na lista/calendário/dentistas; recarregar referências atuais e permitir revisão explícita antes de reenviar. Sem repetição automática. Recarga falha não limpa o rascunho ou libera confirmação indevida.
- Invalidar caches relevantes após sucesso e consultar no servidor para proteger outros computadores. Não confundir invalidação na mesma aba com atualização em tempo real entre computadores.

## Aceite da implementação transacional

| Camada | Cenários obrigatórios |
| --- | --- |
| Domínio/schema | Horas/minutos inválidos, segundos/microssegundos, timezone/dia, fronteiras, pausa e estado cancelado |
| PostgreSQL | Seis interleavings reproduzidos, ambas as ordens de commit, consultas independentes/compatíveis, troca oposta de dentistas, leitura ORM antiga, rollback e procedimentos intactos |
| Negócio | Política escolhida para compromissos existentes, estados clínicos, limite temporal e dados legados; sem alteração automática de histórico |
| Integração | Versões, exclusão, constraints da agenda, snapshots/financeiro; erros 409 controlados e nenhum recibo parcial |
| HTTP/permissões | Horário inválido, inativo, reativação, revogação e erro sem divulgação de dados de paciente |
| Componentes/Chrome | Duas abas, mudança de disponibilidade/inativação, criação/reagendamento/reativação, mensagem correta, rascunho, recarga/revisão e fluxo compatível |
| Entrega | Cópias, regressão/CI, atualização preservando dados, zero schemas descartáveis, commit/push e HEAD remoto |

## Ambiente e retomada

- **Estado final após 2B.7.2:** CI `36236034979` aprovado, 262 backend/106 frontend; HTTP e Chrome privado em duas abas aprovados. Principal atualizada, revisão `0022`, dados/histórico/bytes preservados, zero schemas e nenhum volume removido. Próximo passo: preparação 2B.8, concorrência administrativa em usuários/permissões. Não repetir esta etapa nem perguntar novamente a política já escolhida. Os estados seguintes são históricos.

- **Estado após 2B.7.1:** principal atualizada em https://localhost:18443, revisão `0022_dentist_user_restrict`, dados/histórico/bytes preservados, zero schemas descartáveis e nenhum volume removido. CI `36206543443` aprovado, 254 backend/102 frontend; HTTP e Chrome aprovados. Próximo passo é 2B.7.2, incorporando a resposta sobre compromissos existentes antes de implementar a política; não repetir a validação já entregue. Os itens abaixo registram o ambiente da preparação original.

- Principal permanece **https://localhost:18443**, revisão `0022_dentist_user_restrict`, sem reconstrução/reinício/migração nesta preparação. Comparação com checkpoint da 2B.6.4.2 confirmou linhas de negócio, histórico e bytes de exames preservados; zero schemas descartáveis. Nenhum volume removido.
- Último CI funcional permanece [36147540532](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/36147540532), 247 backend/97 frontend, da etapa anterior. Não repetido para documentação. Nesta preparação houve banco/caso de uso/schema; **não houve nova homologação HTTP nem Chrome**.
- Próximo passo independente da resposta: implementar **2B.7.1**, validação de horários e fronteiras. Para 2B.7.2, incorporar a escolha sobre compromissos existentes antes de implementar a política. R18 continua parcial; instalação assistida e prontuário/auditoria clínica seguem em etapas próprias.
