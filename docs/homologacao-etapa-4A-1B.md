# 4A.1B — persistência transacional clínica

## Implementação — 27/10/2026

Base `3ecf0d0`. Migração [0026](../apps/api/alembic/versions/0026_clinical_records.py) e [repositório](../apps/api/src/adapters/db/repositories/clinical_record_repository.py) adicionados. Ainda sem rotas ou telas; a versão de instalação permanece `piloto-cadastros-v0.1.23`, anterior à migração nova. Não instalar o HEAD de desenvolvimento como se fosse uma nova versão homologada para a clínica.

### Banco

- Registro próprio e único por consulta; autor, paciente, dentista e consulta preservados por chaves estrangeiras. A identidade paciente/dentista da consulta não pode ser trocada enquanto houver registro clínico, inclusive rascunho. Reagendamento de horário não troca os vínculos.
- Adendos separados, com autoria, motivo, instante e versão do registro; recibos de operação guardam o resultado original.
- Triggers impedem exclusão dos registros clínicos, alteração de identidade e reescrita do texto/contexto/data finalizados. Adendos e recibos não aceitam UPDATE/DELETE.
- Downgrade recusado quando existem registros, evitando uma reversão que apague o novo histórico. Backup/recuperação da versão nova ainda exigem ensaio antes de publicação de instalação.

### Transação e autorização

- Usa o bloqueio administrativo existente para reler usuário, sessão e permissão dentro da operação. Sem bypass de administrador; permissão clínica ausente significa acesso negado.
- O bloqueio serializa as operações com mudanças administrativas e entre si; é uma escolha conservadora para este primeiro recorte, não um teste de capacidade sob carga.
- Criação bloqueia a consulta; mutações bloqueiam o registro e comparam versão antes de gravar. Finalização captura alergias/histórico atuais diretamente do banco.
- Resultado e recibo são confirmados juntos. Falha de commit não deixa versão, adendo ou recibo parcial.
- Chave vinculada ao autor e ao conteúdo da tentativa. Repetição exata retorna o resultado capturado, mesmo que o registro tenha avançado; corpo diferente recebe conflito. Revalidar sessão/permissão/autoria ocorre antes da recuperação.
- A matriz pública ainda não reconhece `clinical_records`: os testes atribuem a permissão somente nos schemas privados. Não expor rotas antes de integrar a administração, o frontend e os erros de vínculo/exclusão.

## Aceites locais

Testes em [test_clinical_record_db.py](../apps/api/tests/test_clinical_record_db.py), exclusivamente em schemas descartáveis de `erp_dents_homolog`. A fixture existente aplica migrações isoladas, usa conexões independentes nas disputas e remove somente seu próprio schema; volumes preservados. Código/migrações/testes montados somente para leitura na imagem API de homologação; containers principais não foram atualizados.

A primeira execução falhou no preparo ao inserir um perfil já criado pela migração. Fixture corrigida para atualizar a permissão existente. Nova execução dos 12 testes iniciais passou (`.data/clinical-record-db-final.log`). Rodada final: **28 testes aprovados em 74,270 s**, sendo 14 de domínio e 14 de PostgreSQL, incluindo administrador e sessão expirada/alheia (`.data/clinical-record-acceptance.log`). CI integral ainda pendente. A rodada inicial não é aceite.

## Próximo passo e limites

Concluir CI integral antes de encerrar 4A.1B. Depois integrar API e permissionamento real, incluindo configuração do novo recurso, exceção do admin, revogação e conflitos ao excluir/reassociar entidades com registro clínico. Leitura paginada e telas pertencem à integração seguinte. Não é homologação de prontuário em navegador nem liberação para uso clínico. 4A continua em andamento; P3 físico do piloto de cadastros mantém prioridade.
