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
- Chrome/API/SQL do piloto de cadastros aprovado: CPF, nascimento, documentos históricos, RG, permissões, busca, conflito, reabertura e reinício. Log `.data/clinical-access-registration.log`. Nenhuma interface mudou; esse teste de regressão não substitui o futuro aceite visual da auditoria.

## Pendências e retomada

Conferir CI completo antes de fechar A.1; regressão de cadastros aprovada. Depois A.2: preparação de download e revalidação pós-scanner; B: consulta/permissão/UI; C: recuperação completa/capacidade e publicação. Harness de recuperação ainda espera 0028: adaptar explicitamente a migração 0029 na etapa C, sem alegar que o ensaio v30 cobre a nova versão. Não repetir aceites locais aprovados sem mudança/falha.

Instalação segue `piloto-cadastros-v0.1.30`/0028. Não instalar main parcial. P3 físico prioritário; odontograma posterior.

## Revisão final

Offset da auditoria alterado para bigint, compatível com OFFSET do PostgreSQL; teste acrescentado para página vazia com offset 2**31, evitando falha nova em consultas anteriormente aceitas. CI inicial 42826078949 do produto `dc6edde` foi iniciado; resultado do produto final deverá ser conferido após este ajuste.

Build final e sete testes PostgreSQL focados aprovados em 21,072 s após ajuste do offset (`.data/clinical-access-final-tests.log`). Sem mudança de rotas, UI ou autorização após o HTTP/Chrome aprovados.

**Retomada 6D.3.3A.1 — 10/11/2026:** produto final `fe0ae19`; [CI 42826331688](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/42826331688) em andamento. 39 regressões clínicas aprovadas; após ajuste de offset bigint, sete testes focados/build aprovados (21,072 s). HTTP/SQL e cadastros Chrome/API/SQL aprovados. **Próximo imediato: conferir CI final e corrigir eventual falha antes de declarar A.1 concluída; depois A.2, download preparado.** Não repetir aceites locais sem mudança/falha. Nenhuma nova tela, recuperação completa ou tag; v0.1.30 preservada. [Relatório](./homologacao-etapa-6D-3-3A.md). CI inicial `dc6edde` não substitui o CI do produto final.
