# 2B.6.3.1 — exclusão de dentistas e proteção das contas

**Concluída em 24/09/2026.** Base `1362185`; implementação `b798cc4`, ajustes de testes `1bb1f41`, segurança `7300ea6`. [Contrato](./plano-etapa-2B6-3.md). Banco, API, Chrome, preservação e CI aprovados.

## Mudanças

- DELETE exige versão positiva: 422 ausente/inválida, 404 inexistente, 409 `stale_version` alterado. Comparação ocorre sob bloqueio com estado atualizado, antes da exclusão; erros revertem a transação.
- Migração `0022_dentist_user_restrict` altera somente a FK `users.dentist_id` de SET NULL para RESTRICT, mantendo nullable e nome real da constraint. Conta vinculada, ativa ou inativa, impede excluir dentista; consultas continuam impeditivas em qualquer estado. Resposta `409 linked_record` não expõe identidade/valores de registros vinculados.
- Para regularizar conta vinculada, administrador autorizado pode reatribuir dentista ou mudar perfil pelas ações existentes; reatribuição continua revogando sessões. A exclusão não modifica contas nem revoga sessões implicitamente. Contas já órfãs não ganham associação inventada.
- A confirmação usa nome/CRO salvos e versão exibida; informa remoção do cadastro/horários e permanência de cobranças/pagamentos. Erro mantém rascunho e exige recarga bem-sucedida/nova confirmação, sem repetição automática. Sucesso invalida dentistas, agenda/consultas e financeiro.
- Financeiro mantém SET NULL da referência atual e todas as versões/valores/status, capturas, pagamentos, estornos e recibos. Bloqueio por conta/consulta reverte também qualquer efeito financeiro. Permissão de exclusão não exige visualizar usuários/financeiro.
- Downgrade restaura SET NULL e perde essa proteção de contas, sem reescrever linhas. Atualizar API/web juntos e recarregar abas antigas; DELETE antigo sem versão recebe 422.

## Validação por camada

- **Banco:** 21 testes focados iniciais aprovados em 58,310s. Após ampliar a matriz, 13 testes novos finais aprovados em 40,531s. Migração preserva linhas e sessão existente, conta órfã e constraint renomeada; downgrade/upgrade e delete direto. Estado ORM antigo/horários, edição × exclusão, dois DELETEs, contas ativas/inativas e consultas em quatro estados.
- **Concorrência PostgreSQL:** conexões independentes/barreiras para criação e reatribuição de conta/consulta, exclusão após leitura, edição recusada sem perda de campos, cobrança pendente confirmada antes da exclusão, criação pendente/paga rejeitada sem evento/recibo parcial, baixa com bloqueio inverso retornando conflito seguro. Origem conserva dentista e pagamento posterior à exclusão registra referência atual nula. Estorno/repetição e rollback por conta vinculada preservados.
- **Componentes:** 81 testes frontend aprovados, incluindo confirmação do nome/CRO/versionamento, rascunho intacto, 409/404/503/rede, falha de recarga, nova confirmação e cancelamento. Builds API/web aprovados.
- **HTTP:** dez grupos incluindo preparação/limpeza, precondições, conta inativa impeditiva, sessão preservada na recusa, reatribuição explícita revogando sessão, exclusão sem permissões extras, revogação de `dentists.delete`, financeiro e consultas. Primeira inicialização excedeu prazo do harness; repetição isolada passou sem alteração do produto.
- **Chrome:** aprovado em HTTPS descartável. Duas abas, horários editados, exclusão antiga rejeitada, recarga, conta vinculada impeditiva, reatribuição administrativa pela interface e nova confirmação excluindo só o cadastro revisado. Duas capturas conferidas. Asserção inicial de CRO foi ajustada: fixture tinha valor que o formatador existente normalizava durante edição; usado valor fictício no formato estável.
- **Regressão antiga interrompida:** fixture de sessões mantinha transação de leitura em `users` enquanto migração em outra conexão tentava bloqueio exclusivo. Liberada transação antes de migrar; atualizada expectativa de revisão final no teste de downgrade financeiro. CI inicial `35933406274` cancelado para substituição. Isso não foi aprovação da suíte; a execução corrigida foi aprovada posteriormente, conforme fechamento abaixo.

## Atualização local em 24/09/2026

- Regressão corrigida: **222 backend aprovados em 536,444s**; 13 testes adicionais de sessões/downgrade financeiro em 76,317s. HTTPs anteriores de dentistas/referências financeiras adaptados e aprovados. Implementação `b798cc4`, complemento de testes `1bb1f41`, ambos publicados.
- Principal em **https://localhost:18443**, API/web atualizados juntos para `0022_dentist_user_restrict`; FK de usuários conferida como RESTRICT. Dez verificações gerais aprovadas.
- Cópias públicas/exames/fingerprints e dump completo `pre-2B6-3-1*` salvos antes da atualização. Dump completo após zero schemas descartáveis; comparação antes/depois do smoke confirmou todas as linhas de negócio/referências/bytes de exames, excluindo somente revisão Alembic. Zero schemas após entrega; nenhum volume removido.
- [CI 36000043947](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/36000043947): frontend/backend/HTTP aprovados, auditoria de imagens reprovada. Reprodução local identificou CVE-2026-93990 em libexpat 2.8.4-r0 no web/gateway. A imagem oficial mais recente ainda continha essa versão; builds web/gateway/edge passaram a instalar explicitamente 2.8.5-r0, com base nginx fixada por digest. Produção/desenvolvimento/homologação usam o mesmo Dockerfile de gateway/edge; apenas homologação foi atualizada.
- Auditoria local após correção: seis imagens sem achados (incluindo edge, agora coberto). Builds aprovados; dez verificações gerais aprovadas e dados de negócio/histórico/exames preservados. Resultado remoto registrado no fechamento abaixo. Logs locais `nginx-security-*`; nenhum volume removido.
- Complemento de segurança publicado em `7300ea6`, HEAD remoto conferido. [CI 36003711760](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/36003711760) aprovado (detalhes abaixo). Web/gateway/edge locais recriados; Chrome repetido no build corrigido, oito grupos aprovados e duas capturas conferidas. Gateway HTTPS: 413/503, JSON 408 em 30,016s, vagas liberadas e 80 chamadas de saúde (p95 local 2,234s). Nova comparação confirmou dados/exames preservados e zero schemas descartáveis.

## Fechamento

- [CI 36003711760](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/36003711760) aprovado em **15min34s**: **222 backend em 543,774s e 81 frontend**, regressões HTTP, builds e auditorias de pacotes/imagens. As seis imagens, incluindo HTTPS/edge, sem achados nessa execução. Log local `nginx-security-ci.log`.
- Gateway no CI: 413/503, JSON 408 em 30,011s, vagas liberadas e 80 chamadas de saúde com p95 de 0,0404s. Resultados locais e remotos são medições distintas, sem equivaler a capacidade de produção.
- Principal em **https://localhost:18443**, revisão `0022_dentist_user_restrict`; banco/exames preservados, cópias locais mantidas e nenhum volume removido. Chrome com build corrigido aprovado e capturas conferidas. Recarregar abas antigas.
- Fechamento documental posterior ao CI; publicar por commit/push e conferir HEAD local/remoto. Próximo passo: preparação 2B.6.4. Não repetir a revisão geral ou testes aprovados sem nova alteração/falha.

## Comandos de reprodução

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml build api web gateway edge
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 -e PYTHONPATH=/app:/app/tests api python -m unittest test_dentist_deletion test_dentist_version -v
python scripts/smoke_dentist_deletion_homolog.py
python scripts/smoke_dentist_deletion_browser_homolog.py
```

Todos os dados de teste são fictícios, em schemas descartáveis exclusivos de `erp-dents-homolog`. Harnesses HTTP/Chrome sequenciais (porta 18001); Chrome usa HTTPS 18444 e CA confiável, credenciais via stdin e somente diagnóstico de etapa. Logs/capturas/cópias `.data/dentist-deletion-*` e `.data/homolog` fora do Git. Não remover volumes para contornar migração.

## Limites e próxima etapa

Não corrige cadastros dentistas já órfãos em outras instalações, nem muda concorrência disponibilidade × agendamento, política clínica ou auditoria integral. Próximo recorte após fechamento: preparação 2B.6.4, exclusão de pacientes/exames, considerando mudanças dos filhos, fila de limpeza e arquivos. Instalação assistida continua na etapa 5.
