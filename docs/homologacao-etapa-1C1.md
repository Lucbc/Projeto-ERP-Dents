# Etapa 1C.1 — administração de usuários

Data: 15/09/2026. Ambiente: `erp-dents-homolog`, exclusivamente dados fictícios.

## Resultado

Corrigidos R08 (gestão delegada podia conceder acesso administrativo) e R09 (perda do último administrador pelas rotas de gestão). A etapa 1C continua aberta para bootstrap exclusivo, revogação de sessões, segredos e política de autenticação.

## Regras implementadas

- Somente administrador pode criar/promover outro administrador ou alterar, rebaixar, inativar, excluir e redefinir a senha de uma conta administrativa, inclusive inativa.
- Permissões delegadas continuam permitindo gerenciar contas não administrativas, respeitando a ação concedida. A delegação permite criar/gerenciar os demais perfis; não constitui isolamento entre esses perfis.
- Não é possível excluir, inativar ou rebaixar o último administrador **ativo**. Um administrador inativo não conta como substituto. A API responde 409 e orienta cadastrar ou ativar outro administrador.
- O último administrador pode atualizar nome/e-mail e senha normalmente. Havendo outro administrador ativo, as operações administrativas continuam disponíveis.
- A identidade do solicitante e suas permissões são relidas dentro da operação protegida. Uma requisição que esperou enquanto o solicitante perdeu privilégios não reutiliza a identidade antiga.
- Valores nulos nos campos obrigatórios de atualização são rejeitados como erro de validação; `dentist_id` continua opcional conforme o perfil.
- A interface omite a opção Administrador e as ações sobre contas administrativas para usuários delegados. Explica a regra de manter um administrador ativo.
- Alterar o próprio perfil/status ou excluir a própria conta encerra a sessão local para evitar manter menus/permissões antigos.

## Concorrência e decisão técnica

O repositório PostgreSQL obtém `LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE` antes de reler ator/alvo, contar administradores e gravar. O bloqueio é mantido até o commit; erros fazem rollback. Isso serializa as gravações administrativas de usuários enquanto permite leituras comuns. O estado ORM carregado antes da espera é expirado para que os dados sejam relidos.

É uma solução deliberadamente simples para operações administrativas pouco frequentes, sem migração de banco. Não é uma constraint universal: SQL direto ou novos caminhos que ignorem o caso de uso precisam respeitar a mesma regra. Criação inicial concorrente e ativação do bootstrap serão tratadas na 1C.2.

Referência: [bloqueios explícitos do PostgreSQL 16](https://www.postgresql.org/docs/16/explicit-locking.html).

## Evidências

| Camada | Resultado |
|---|---|
| Backend/PostgreSQL | 16 testes passaram, com subcenários de criação, promoção, alteração, senha, exclusão, status e campos nulos |
| Concorrência | Dois escritores ficaram comprovadamente esperando pelo bloqueio em `pg_locks`; em exclusão, rebaixamento e inativação simultâneos, um passou e o outro recebeu conflito, preservando um administrador ativo |
| Identidade após espera | Privilégio administrativo retirado enquanto a operação aguardava; a operação foi negada após adquirir o bloqueio |
| HTTP real | 7 grupos passaram: bloqueio padrão, delegação explícita, proibição de criar/promover admin, proteção da conta admin, edição/senha de conta comum, exclusão comum e bootstrap fechado |
| Regressão funcional | 10 grupos do smoke geral passaram: login, cadastros, agenda, perfis, cobrança, exames e limpeza |
| Frontend | 15 testes de sessão continuaram passando; build TypeScript/Vite e Nginx aprovados |
| Chrome | Coordenador delegado viu “Somente administrador” nas contas admin; cadastro ofereceu apenas Coordenador, Dentista e Recepção |
| Limpeza | Contas temporárias removidas, matriz original do coordenador restaurada e zero schemas `test_users_*` restantes |
| Dados existentes | Administrador e registros da etapa 0 preservados; volumes mantidos; nenhuma migração de banco necessária |

Os testes de perda do último administrador ocorreram em schemas descartáveis, sem tentar excluir o administrador persistente da homologação. Não houve teste de carga geral da clínica.

## Como reproduzir

Com Docker ativo e ambiente preparado:

```powershell
./scripts/homolog.ps1 -Action up
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml exec -T -e RUN_HOMOLOG_TESTS=1 api python -m unittest discover -s tests -v
npm test --prefix apps/web
```

O teste PostgreSQL exige opt-in e o nome de banco `erp_dents_homolog`. Cada teste cria/remove apenas seu schema aleatório `test_users_<uuid>`; não limpa o schema `public`.

O teste HTTP usa Python 3 com biblioteca padrão e as credenciais fictícias criadas pelo smoke inicial:

```powershell
./apps/api/.venv/Scripts/python.exe ./scripts/smoke_admin_homolog.py
```

Para inspeção da interface, `--keep-fixtures` mantém temporariamente contas de teste e delegação de coordenador. Finalizar com `--cleanup`, que remove essas contas e restaura as permissões originais. Estado local em `.data/homolog/admin-fixtures.json`, ignorado pelo Git; não publicar credenciais.

## Próximo passo

**1C.2 — bootstrap exclusivo e ativação inicial controlada.** Depois, revogação de tokens e política de autenticação em entregas próprias. Atualizações gerais de dependências/lockfiles continuam na 1D.
