# Etapa 2B.5.1 — versão nas alterações financeiras

Base `e6a5578`, iniciada em 21/09/2026. Implementação conforme [plano financeiro](./plano-etapa-2B5.md). Regressão local aprovada; publicação/CI ainda em andamento.

## Contrato

- Migração `0019_financial_version`: versão positiva, inicialmente 1. Preserva valores, pagamento, vínculos e recibos da geração idempotente.
- GET/lista/criação/geração retornam versão. PUT e baixa exigem `version` inteiro positivo estrito no corpo; DELETE exige `?version=<inteiro positivo>`. API e frontend devem ser atualizados juntos; abas antigas precisam recarregar.
- Precondição ausente/inválida: 422. Registro inexistente: 404. Versão antiga: 409 com `stale_version`. Conflitos codificados mantêm referência segura igual ao cabeçalho `X-Request-ID`.
- PUT confere versão antes da normalização e no UPDATE atômico. Todos os campos normalizados e o incremento são gravados juntos. Campos omitidos são preservados; tentativa sem mudanças consome versão. Validação, FK ou unicidade rejeitadas não consomem versão nem deixam gravação parcial.
- Baixa exige estado pendente, além da versão, na mesma escrita. Pago/cancelado com versão atual retorna 409 `financial_state_conflict`; versão antiga retorna `stale_version`. Repetição não muda data, forma, valor, versão ou `updated_at`. Não há recuperação automática de resposta por chave nesta entrega.
- DELETE compara ID/versão antes de excluir. Uma exclusão baseada em lista antiga não apaga edição/baixa mais recente. Recibos de geração permanecem com referência nula, bloqueando recriação por reenvio antigo.
- Geração com mesma chave continua recuperando o registro existente e sua versão atual, sem sobrescrever status ou preço. Índice de cobrança ativa por consulta mantido.

## Interface

O formulário guarda versão de origem e rascunho. Somente conflito de versão oferece **Descartar rascunho e carregar atual**; falha de leitura mantém campos. Recarga substitui explicitamente valores, datas, status e vínculos. Data de pagamento carregada e não editada é enviada na precisão original, sem truncar segundos/frações ao passar pelo campo `datetime-local`.

Baixa/exclusão enviam a versão exibida na linha. Após 409, a tela solicita **Recarregar financeiro**, bloqueia essas ações até uma leitura bem-sucedida e não repete a operação automaticamente. Confirmação de exclusão continua obrigatória. Fechar/cancelar/salvar/recarregar o formulário ficam coordenados durante solicitação pendente.

## Preservação

Cópias locais anteriores `.data/homolog/pre-2B5-1.dump`, `pre-2B5-1-exams.tar` e fingerprints. Homologação principal atualizada em **https://localhost:18443**, banco `0019_financial_version`. Comparação após migração/smokes confirmou dados de negócio e bytes dos exames preservados, incluindo recibos de geração. Exclui autenticação, revisão Alembic e apenas a nova coluna de versão financeira. Nenhum volume removido.

A migração exige janela pelo bloqueio da tabela; downgrade remove versões/proteção, sem recuperar valores anteriores. Cópias e credenciais não vão ao Git e não substituem ensaio completo de restauração.

## Validação

- **PostgreSQL:** dez casos novos de versão e onze de geração. Disputas PUT×PUT, PUT×baixa, baixa×cancelamento, baixa×baixa e PUT×DELETE com conexões independentes; um vencedor por versão. Intercalação controlada confirma que edição parcial não restaura valor concorrente. Conferidos total/campos do vencedor, repetição, estado, rollback por índice/FK, exclusão anterior e migração preservando registros/recibos.
- Na primeira execução focada, 20 casos passaram e um falhou por preparação inválida do próprio teste: criação cancelada já vinculada à consulta ativa. Corrigida a fixture para criar sem vínculo e exercer diretamente a rejeição do índice; caso repetido aprovado. As garantias da 2A.2 foram mantidas, inclusive testes históricos com schema anterior à nova coluna.
- **HTTP:** onze grupos específicos (precondições, permissões anônimas/perfil somente leitura, disputa e preservação do pagamento, mais preparação/limpeza). Onze grupos de geração idempotente e dez do fluxo geral aprovados.
- **Frontend:** 56 testes aprovados, incluindo três novos: rascunho/recarga com falha/data exata; baixa antiga; exclusão antiga. Os dois últimos confirmam envio da versão e ausência de repetição automática após recarga.
- **Chrome real/HTTPS:** duas abas verificaram formulário antigo após baixa, recuperação e salvamento mantendo data exata; dois formulários concorrentes; exclusão com versão antiga e recarga explícita. Capturas locais conferidas e fixtures removidas.
- Builds API/web aprovados. Suíte backend completa aprovada: **177 testes em 478,929s**, zero schemas descartáveis. CI pendente nesta versão do relatório. Smoke de geração no navegador teve somente a limpeza adaptada para enviar versão; não foi reexecutado nesta entrega. Sua garantia de repetição foi coberta por PostgreSQL/HTTP, sem simular novamente perda de resposta no Chrome.

Comandos específicos:

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 -e PYTHONPATH=/app:/app/tests api python -m unittest test_financial_version test_financial_concurrency -v
python scripts/smoke_financial_version_homolog.py
python scripts/smoke_financial_homolog.py
node scripts/smoke_financial_version_browser_homolog.cjs
```

Smokes de API descartável compartilham porta 18001 e devem ser sequenciais. Chrome exige CA confiável e `PLAYWRIGHT_MODULE` quando instalado fora do projeto.

## Limites e próxima etapa

**Controle de versão não é histórico financeiro.** Edição intencional com versão atual ainda pode alterar/reabrir lançamento pago, e exclusão atual ainda é física. Pagamentos imutáveis, autoria, estorno com motivo e deduplicação persistente da baixa são o próximo recorte, **2B.5.2**, que exige definir todos os caminhos de pagamento antes de migrar dados legados. As proteções de geração da 2A.2 continuam válidas; R26 não está encerrado.

Datas/fuso, totais por vencimento versus caixa, atualização automática entre computadores e referências históricas dos cadastros permanecem nos recortes já registrados. Nenhum histórico retroativo ou autor foi inventado nesta migração.
