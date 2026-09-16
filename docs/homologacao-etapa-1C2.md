# Homologação — etapa 1C.2

Concluída em 15/09/2026. Escopo: primeira configuração exclusiva do administrador (R10 e reabertura de R09). Ambiente: `erp-dents-homolog`, somente dados fictícios.

## Alterações

- A criação inicial exige código local pelo cabeçalho `X-Bootstrap-Token`. A consulta pública informa apenas se a configuração está disponível. Código ausente/incorreto ou configuração inválida no servidor bloqueiam a criação.
- `configure-bootstrap.ps1` gera 32 bytes aleatórios representados por 64 caracteres hexadecimais, sem imprimir o segredo. Preserva valores existentes e rejeita variáveis duplicadas. A homologação prepara sua própria variável.
- A migração `0008_installation_state` cria um registro único de instalação. Bancos com qualquer usuário existente, inclusive inativo ou não administrador, são marcados como configurados, preservando credenciais.
- Criação do usuário e marcação de configuração concluída são confirmadas na mesma transação, sob bloqueio administrativo PostgreSQL. Duas solicitações concorrentes resultam em uma criação e um conflito. Falhas revertem ambas as alterações.
- Reiniciar a API ou excluir usuários não reabre a configuração. Ausência indevida do registro de instalação bloqueia a criação.
- A tela pede o código apenas quando necessário. Trata código recusado, indisponibilidade e criação feita por outro computador. Uma criação bem-sucedida não reabre o formulário caso o login automático falhe.

## Verificações executadas

| Camada | Resultado |
|---|---|
| PostgreSQL e casos de uso | 26 testes aprovados: 16 administrativos anteriores e 10 de bootstrap, incluindo migrações reais, rollback e concorrência observada em `pg_locks` |
| Frontend | 21 testes aprovados: 15 de sessão e 6 de configuração inicial |
| HTTP em API temporária | 7 grupos aprovados: banco vazio, códigos recusados, concorrência, login, fechamento, reinício e exclusão de usuários sem reabertura |
| Fluxo integrado existente | 10 grupos aprovados, incluindo login, cadastros, agenda, financeiro e exames |
| Gerador PowerShell | Geração, preservação, idempotência, variáveis separadas e rejeição de duplicidade aprovadas |
| Build | TypeScript/Vite e imagens Docker aprovados; serviços atualizados |
| Navegador Chrome | Instalação existente exibe somente login; administrador existente chega ao painel |

O formulário de primeira configuração foi validado por testes de componentes e HTTP real. Não foi executada uma criação de conta nova pelo navegador nesta entrega.

## Reprodução

Na raiz do projeto, com Docker ativo:

```powershell
./scripts/test-configure-bootstrap.ps1
./scripts/homolog.ps1 -Action up
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 api python -m unittest discover -s tests -v
npm test --prefix apps/web
./apps/api/.venv/Scripts/python.exe scripts/smoke_bootstrap_homolog.py
./apps/api/.venv/Scripts/python.exe scripts/smoke_homolog.py
```

Os testes de banco usam schemas descartáveis no banco de homologação. O teste HTTP cria uma API temporária na porta local 18001 e um schema próprio; remove seu container, arquivo de ambiente e schema ao terminar. A porta deve estar livre. Relatórios em `.data/homolog` são locais e não entram no Git.

## Dados e migração

Antes de atualizar a API principal, foi gerada a cópia local `.data/homolog/pre-1C2.dump`. É uma cópia somente do banco, não um backup completo com exames nem uma prova de restauração. Os testes da nova migração passaram em schemas isolados antes da atualização principal.

A homologação está em `0008_installation_state (head)`. Registros fictícios anteriores e volumes foram preservados. A API temporária e os schemas dos testes foram removidos. Web: `http://localhost:18080`; API: `http://localhost:18000`, restritas ao computador local.

O procedimento de ativação está no [README](../README.md#ativação-do-primeiro-administrador). Instalações existentes não precisam do código para fazer login.

## Limites e próxima etapa

- Próximo recorte: **1C.3 — revogação de sessões no servidor**. Demais ajustes de senhas e tentativas continuam na etapa 1C.
- Instalador assistido, HTTPS e restauração completa permanecem na etapa 5. A homologação HTTP usa apenas dados fictícios.
- O estado persistente protege o fluxo da aplicação; não impede alterações por alguém com acesso administrativo direto ao banco. Reverter a migração, executar código antigo ou restaurar cópia anterior à ativação exige reavaliar esse estado. Não foi homologado downgrade como recuperação.
- Git sincroniza código, testes e documentação. Segredos, banco e exames locais não são transferidos por esse processo.
