# 6D.3.3A.1 — gravação de consultas clínicas

Implementação em 10/11/2026, base `87ae720`. Aceites locais aprovados; CI completo ainda pendente. Não há nova tag de instalação.

## Mudanças

- Migração aditiva `0029_access_audit`: três ações clínicas, IDs/versões em arrays tipados e limitados, quantidade/paginação, instante do banco e ator. Restrições por ação; índices por ator/paciente. Sem valores pessoais, texto/contexto clínico, credenciais ou sessão.
- Guardas contra UPDATE/DELETE/TRUNCATE e downgrade de tabela preenchida; sem chaves estrangeiras destrutivas ou retroatividade. A ação de download será acrescentada na subetapa própria, sem antecipar semântica de transmissão.
- `get`, `get_for_appointment` e `list_for_patient` materializam conteúdo, inserem evento e confirmam antes de retornar, dentro da autorização/bloqueio existente. O rollback do contexto libera a transação após falhas. Escritas continuam usando `_load`, sem gerar evento falso de leitura.
- Consultas vazias mantêm seu retorno. Agendamento desconhecido gera evento sem paciente resolvido, com alvo de agendamento e zero registros; página usa o paciente solicitado. ID de registro inexistente, recusas e paginação inválida não geram sucesso.
- Evento significa consulta autorizada preparada, não leitura humana nem confirmação de entrega HTTP. Repetições geram eventos independentes.

## Validação local

- Build da API aprovado; nenhuma troca de contêiner principal nem migração do banco principal.
- Primeira bateria: seis testes novos PostgreSQL aprovados (20,834 s). Depois, sete testes novos, incluindo revogação concorrente e mais restrições SQL, integrados à bateria de **39 testes clínicos aprovados em 72,232 s**: domínio, contrato, banco e concorrência.
- PostgreSQL em esquemas descartáveis de `erp-dents-homolog`: três leituras, repetição, paginação/vazio, autoria/campos, INSERT e commit falhos, ausência de retorno, preservação de registros/recibos, imutabilidade, formato SQL, downgrade recusado e migração 0028→0029 sem eventos inventados.
- Concorrência real: leitura aguardou bloqueio administrativo; revogação confirmada antes de liberar o bloqueio impediu conteúdo e evento.
- HTTP autenticado/SQL: harness clínico existente ampliado e aprovado. Conferiu três ações/ator/IDs/versões, sem texto/segredo; 403/404/422/401 sem novos eventos, falha de INSERT nas três rotas sem conteúdo e recibos intactos; ciclo clínico original/replay/adendo e reinício aprovados. Recursos privados removidos.
- Logs locais ignorados: `.data/clinical-access-build.log`, `.data/clinical-access-tests.log`, `.data/clinical-access-regression.log`, `.data/clinical-access-http.log`.
- Não houve aceite novo de Chrome: nenhuma interface foi alterada. Testes de API/banco não substituem a futura tela da auditoria.

## Pendências e retomada

Conferir CI completo e regressão de cadastros antes de fechar A.1. Depois A.2: preparação de download e revalidação pós-scanner; B: consulta/permissão/UI; C: recuperação completa/capacidade e publicação. Harness de recuperação ainda espera 0028: adaptar explicitamente a migração 0029 na etapa C, sem alegar que o ensaio v30 cobre a nova versão. Não repetir aceites locais aprovados sem mudança/falha.

Instalação segue `piloto-cadastros-v0.1.30`/0028. Não instalar main parcial. P3 físico prioritário; odontograma posterior.
