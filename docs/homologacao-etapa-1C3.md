# Homologação — etapa 1C.3

Concluída em 16/09/2026, sobre a base `b683e25`. Escopo: revogação de sessões no servidor (R11). Ambiente exclusivo `erp-dents-homolog`, dados fictícios.

## Comportamento entregue

- Cada login cria um identificador único no JWT e um registro em `auth_sessions`, associado ao usuário e à expiração. O banco não armazena o token completo. Toda requisição autenticada exige sessão válida e usuário ativo.
- Logout elimina apenas a sessão apresentada, com resposta idempotente. Outros logins independentes continuam válidos; abas que compartilham o mesmo token saem juntas.
- Alterações de senha, status, perfil, e-mail ou dentista associado revogam as sessões da conta na mesma transação da alteração. Exclusão do usuário remove sessões por chave estrangeira. Reativação não restaura sessões antigas.
- Login verifica a senha e, sob bloqueio administrativo, relê identidade/hash antes de criar a sessão. Uma redefinição concluída durante essa verificação impede a emissão com a senha antiga. Sessões expiradas são removidas durante novos logins.
- Troca de senha usa o bloqueio administrativo e revoga todos os logins. Senha atual incorreta retorna 400, evitando que o navegador confunda validação do formulário com expiração da sessão.
- O comando local de redefinição também revoga sessões. Corrigida sua importação para a execução direta documentada; antes falhava com `ModuleNotFoundError`.
- O botão Sair espera confirmação da API, oculta dados durante a espera e oferece nova tentativa se houver falha. Uma resposta antiga não encerra uma sessão mais recente. O formulário de senha informa que será necessário entrar novamente em todos os computadores.

## Validação e resultados

| Verificação | Resultado |
|---|---|
| PostgreSQL/casos de uso | 38 testes distintos aprovados: 26 anteriores e 12 de sessões |
| Frontend | 25 testes aprovados: 19 de sessão e 6 de ativação |
| HTTP isolado | 12 grupos aprovados, combinando ativação inicial e revogação |
| Fluxo geral existente | 10 grupos aprovados: login, cadastros, agenda, financeiro, exames e limpeza |
| Build | TypeScript/Vite, imagens Docker e configuração Nginx aprovados |
| Chrome | Login chega ao painel; Sair retorna ao login e reduz de 2 para 1 os registros de sessão no banco |

Os testes PostgreSQL usam schemas exclusivos com migrações reais. Verificam usuário preexistente preservado, rejeição de JWT anterior à migração, logins distintos, logout repetido, troca/reset, inativação/reativação, perfil, exclusão, expiração, associação ao usuário, rollback e disputa entre login e redefinição. O script local foi executado contra schema isolado.

A primeira rodada detectou a falha de importação do comando local. Após correção e ajuste do status de senha incorreta, os 12 testes de sessões passaram novamente. Os 26 testes anteriores passaram na rodada completa; não foram repetidos por alterações posteriores restritas ao script local e à validação da senha atual. Os testes HTTP foram corrigidos para aceitar a resposta 204 vazia de exclusão, depois passaram integralmente.

O teste HTTP usa API temporária na porta local 18001, schema próprio e segredos descartáveis. Verifica inclusive revogação e sessões válidas após reinício real do container. Todos esses recursos temporários foram removidos. Não houve troca de senha pela interface do navegador; esse fluxo foi verificado pela API e por testes de código.

## Reprodução

```powershell
./scripts/homolog.ps1 -Action up
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 api python -m unittest discover -s tests -v
npm test --prefix apps/web
./apps/api/.venv/Scripts/python.exe scripts/smoke_sessions_homolog.py
./apps/api/.venv/Scripts/python.exe scripts/smoke_homolog.py
```

O Python local acima é o ambiente virtual deste computador; outro computador pode usar seu Python instalado. O teste HTTP precisa da porta 18001 livre. Relatórios locais ficam em `.data/homolog/last-session-smoke.json` e no relatório do fluxo geral, sem versionar credenciais.

## Migração e operação

- Banco de homologação em `0009_auth_sessions (head)`, após cópia `.data/homolog/pre-1C3.dump`. Essa cópia cobre somente banco, não exames; não representa teste completo de recuperação.
- Usuários, dados fictícios anteriores e volumes preservados. Tokens anteriores à migração exigem novo login. Web e API continuam limitadas ao computador local nas portas 18080 e 18000.
- Atualização deve manter API e migração compatíveis. Não homologado downgrade: executar versões antigas pode reintroduzir aceitação de tokens sem revogação.
- Revogação passa a valer para novas verificações de autenticação. Não cancela operações já autorizadas em andamento nem remove imediatamente dados já exibidos em outro computador sem nova requisição.
- Com falha de conexão durante logout, a aplicação não confirma saída; permite tentar novamente. A credencial local permanece até confirmação ou expiração.
- `localStorage`, limitação de tentativas, política de senha/bcrypt, dependências, HTTPS e instalação assistida continuam nos recortes previstos. O build ainda aponta tamanho do pacote JavaScript; não impede esta entrega.

## Próximo recorte

**1C.4 — política de senhas, limites de tentativas e configuração de autenticação (R12).** Revisar também recuperação local sem senha na linha de comando. Manter compatibilidade dos hashes existentes e não invalidar credenciais silenciosamente. Depois seguir com 1D e demais etapas do plano.
