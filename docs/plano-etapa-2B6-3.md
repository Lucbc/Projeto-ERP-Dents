# 2B.6.3 — exclusão de dentistas e vínculos

Preparação concluída em 23/09/2026, base `6ff8342`. Complementa [2B.6](./plano-etapa-2B6.md). **Contrato para implementação 2B.6.3.1; esta preparação não muda o produto.**

## Mapa e diagnóstico

- DELETE em `dentists_router.py` exige `dentists.delete`, mas encaminha somente ID por porta/caso de uso. Repositório usa `get/delete/commit`, sem comparar versão. Serviço web e confirmação em `dentists-page.tsx` também não capturam versão; erro apenas mostra toast.
- Edição já incrementa versão na mesma escrita, incluindo nome, CRO, especialidade textual, cor, ativação e disponibilidade JSON. Excluir a linha elimina também os horários nela armazenados. Não há tabela separada de disponibilidade a apagar.
- `appointments.dentist_id` é obrigatório e usa RESTRICT, independentemente do status. Consulta cancelada/concluída continua sendo vínculo impeditivo. Nenhuma exclusão automática de consultas deve ser introduzida.
- `users.dentist_id` usa SET NULL. Criar/editar perfil dentista exige associação em `UserUseCases`, mas excluir o cadastro contorna essa regra e não passa pela revogação de sessões do repositório de usuários. Autenticação consulta usuário atual; o módulo de consultas rejeita perfil dentista sem vínculo. Isso não demonstra ampliação de permissões, mas deixa conta inconsistente e funcionalidade indisponível.
- `financial_entries.dentist_id` usa SET NULL; capturas de origem/pagamentos são independentes. Captura financeira bloqueia dentista com FOR SHARE NOWAIT. Alterar usuário ou financeiro não incrementa versão do dentista.

### Evidência reproduzida

Probe `.data/probe_dentist_deletion_2b63.py`, API/schema descartáveis de `erp-dents-homolog`, somente dados fictícios. **Dez grupos aprovados, incluindo sete de isolamento/preparação/limpeza e três diagnósticos:**

1. Dentista versão 1, usuário vinculado e cobrança paga; editar nome/disponibilidade para versão 2; DELETE com versão 1 ainda retorna 204. GET retorna 404. Financeiro perde só vínculo atual; versão, status, total, captura de origem, pagamento ativo e histórico permanecem iguais.
2. Conta vinculada mantém perfil dentista e estado ativo, agora com `dentist_id=null`. Sessão anterior ainda retorna 200 em `/auth/me`; `/consultations/next` retorna 400 por ausência do vínculo.
3. Outro dentista com consulta: DELETE retorna 409 nos estados agendada, concluída e cancelada, preservando cadastro/disponibilidade.

Log `.data/dentist-deletion-2b63-probe.log`, relatório local `last-dentist-deletion-2b63-probe.json`. São sequências HTTP, **não testes de corrida por barreiras nem homologação visual no Chrome**. Não transformar expectativa do defeito em teste permanente.

Após limpeza, zero schemas descartáveis e comparação integral de dados de negócio/referências/exames aprovada. Consulta agregada na principal: zero contas dentistas sem vínculo e zero contas associadas; isso não representa outras instalações. Nenhuma migração/reinício ou alteração de dados da principal. Último CI funcional: [35904115803](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35904115803), 209 backend/76 frontend.

## Contrato 2B.6.3.1

### Versão, confirmação e recuperação

- Exigir versão inteira positiva na query: 422 ausente/inválida, 404 ausente, 409 `stale_version` alterada. Bloquear/recarregar/comparar antes de excluir; rollback de qualquer falha. PUT × DELETE e DELETE × DELETE com conexões independentes.
- Confirmar nome e CRO quando existente, guardando ID/versão da linha salva. Aviso: “Excluir remove o cadastro e seus horários disponíveis. Cobranças e pagamentos já registrados permanecem.” Não usar campos ainda não salvos do formulário.
- Reutilizar recuperação dos catálogos: impedir repetição após erro, recarga explícita bem-sucedida e nova confirmação. Rede/5xx é resultado incerto; 404 significa ausência atual, sem atribuir autoria. Preservar rascunho de edição.
- Invalidar caches de dentistas, consultas/agenda e financeiro após sucesso. Não apagar histórico do cache como se cobrança tivesse sido excluída. Manter somente `dentists.delete` como autorização; não exigir acesso a usuários/financeiro nem expor nomes de contas, valores ou contagens restritas no erro.

### Proteção explícita das contas vinculadas

**Mudança deliberada em relação ao SET NULL atual:** impedir exclusão de dentista associado a qualquer conta, inclusive inativa. O erro `409 linked_record` orienta regularizar os vínculos ou inativar o cadastro. Não apagar/desativar conta, trocar perfil ou revogar sessões como efeito implícito da exclusão do dentista.

Justificativa: a conta precisa de dentista para seu fluxo de consultas; vinculação de conta não altera a versão do cadastro, portanto só exigir versão não corrige esse problema. Bloquear protege também associação criada depois da leitura. Inativar a conta não remove seu vínculo; um administrador autorizado deve associá-la a outro dentista ou alterar seu perfil pelas ações existentes. Mudança explícita do vínculo continua revogando sessões pelo fluxo de usuários.

- Migration seguinte altera **somente a FK `users.dentist_id` de SET NULL para RESTRICT**, mantendo nullable para perfis sem associação. Atualizar o modelo ORM junto. A FK deve proteger vínculos concorrentes e comandos de banco, não só um pré-check sem bloqueio.
- Não depender de nome implícito de constraint sem conferir o esquema/migração original. Upgrade/downgrade testados em schema isolado; downgrade restaura semântica anterior e deve ser documentado como perda dessa proteção, sem apagar linhas.
- Preservar todas as contas, versões de dentistas, sessões, permissões, horários e registros financeiros durante a migração. Contas dentistas já órfãs não ganham associação inventada: inventariar somente contagem e orientar regularização administrativa; não corrigi-las automaticamente nesta migração.
- Após comparar versão sob bloqueio, usar erro de FK conhecido como `linked_record`; não confundir FK com falha de versão nem transformar qualquer IntegrityError em vínculo. A versão antiga deve falhar antes de qualquer efeito mesmo se houver vínculos.

### Consultas, disponibilidade e financeiro

- Preservar RESTRICT de consultas em todos os estados. Cadastro sem vínculos impeditivos continua podendo ser excluído, ativo ou inativo. Não substituir exclusão por inativação automaticamente.
- Criação/reagendamento de consulta × exclusão: se vínculo confirma primeiro, exclusão falha; se exclusão confirma primeiro, criação/edição não pode deixar consulta órfã. Testar rollback de procedimentos e outros campos. Mudança de disponibilidade × exclusão disputa a versão do dentista; disponibilidade × agendamento é outro contrato, ainda pendente.
- Financeiro continua SET NULL; valores, versões, status, pagamentos, estornos, autores, snapshots e recibos permanecem. Não exigir permissão financeira adicional para excluir. Vínculo de usuário/consulta impeditivo deve preservar também vínculo financeiro quando toda a exclusão é revertida.
- Criação/baixa financeira × exclusão pode ter ambos os sucessos conforme ordem. Se criação confirma primeiro, excluir depois conserva captura e desfaz vínculo atual; se excluir primeiro, criação com ID inválido reverte lançamento/evento/recibo. Na baixa posterior de lançamento existente, referência atual ao dentista pode ser nula; origem permanece. Manter NOWAIT e mapeamento seguro de 55P03/40P01/40001 para 409, sem repetição automática.
- Não introduzir ordem de bloqueios invertida com a administração de usuários. FK garante associação; não adicionar bloqueio global de administração na exclusão sem evidência. Testar vínculo/desvínculo/reatribuição concorrentes e ausência de efeitos parciais.

## Matriz de aceite

| Camada | Verificação |
| --- | --- |
| Migração | Upgrade/downgrade e dados preservados; conta ligada impede delete direto; conta previamente órfã não é alterada/inventada |
| Repositório | ORM carregado antes da edição; versão obrigatória; PUT/horários × DELETE; dois DELETEs; rollback conserva cadastro, contas, consultas e financeiro |
| Vínculos | Associação de conta/consulta depois da leitura; criação × exclusão com barreiras; conta inativa também impede; regularização explícita permite excluir |
| Sessão/permissão | Exclusão rejeitada conserva sessão/associação; reatribuição explícita revoga sessão como hoje; `dentists.delete` e sua revogação, sem acesso adicional a contas/financeiro |
| Financeiro | Pendente/pago, estorno/repetição, referência atual nula e capturas intactas; disputa de criação/baixa e rollback sem eventos parciais |
| API/UI | 422/404/409 e códigos distintos; nome/CRO/versionamento da confirmação; recarga/nova confirmação; rascunho e falha de rede |
| Chrome | Duas abas editam horários/excluem versão antiga; recarga; vínculo impede exclusão; desfazer vínculo por usuário autorizado e confirmar versão atual |
| Entrega | Adaptar portas/UC/rotas/repo/modelo/migração/services/tela/testes/smokes; cópias; API/web juntos; preservação; regressão/CI; commit/push e HEAD remoto |

Scripts afetados incluem homologação geral, edição de dentistas, agenda, financeiro/referências e limpezas de navegador; localizar também DELETE construído por variável. Implementar em uma entrega coerente, sem API exigindo versão enquanto frontend ainda envia somente ID.

**Próximo passo:** 2B.6.3.1, começar pela migração e testes de versão/vínculos em schemas isolados. Pacientes/exames, auditoria clínica completa, vinculação por especialidade, dados legados de contas órfãs e concorrência disponibilidade × agendamento mantêm recortes próprios. Instalação assistida permanece na etapa 5.
