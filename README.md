# ERP Dents (MVP)

Monorepo para clínica pequena de ortodontia com arquitetura cliente-servidor, backend FastAPI (Clean Architecture Hexagonal), frontend React e persistência em Postgres + filesystem para exames.

## Correções em etapas e homologação

O status das entregas e o ponto de retomada ficam em [docs/PLANO-DE-EXECUCAO.md](docs/PLANO-DE-EXECUCAO.md).

Testes de sessão/cache do frontend: `npm test --prefix apps/web` (após instalar as dependências de desenvolvimento). Evidências e limites da correção em [docs/homologacao-etapa-1B.md](docs/homologacao-etapa-1B.md).

Testes de permissões administrativas e concorrência do último administrador: [docs/homologacao-etapa-1C1.md](docs/homologacao-etapa-1C1.md).

Para continuar o desenvolvimento em outro computador, atualize sua cópia com `git pull --ff-only` e reconstrua a homologação com o script abaixo. Código e documentação ficam no Git; senhas locais, banco e exames do Docker permanecem em cada máquina. Uma instalação nova de homologação terá banco próprio vazio.

Para homologar neste computador Windows, com Docker ativo:

```powershell
./scripts/homolog.ps1 -Action up
./scripts/homolog.ps1 -Action status
```

- Interface: `http://localhost:18080`
- API: `http://localhost:18000`
- Somente dados fictícios. As portas estão restritas a este computador.
- O script gera `.env.homolog` com segredos aleatórios na primeira execução e preserva o arquivo nas seguintes.
- `./scripts/homolog.ps1 -Action stop` para os containers e preserva os dados; `-Action logs` mostra diagnóstico.
- A instalação assistida para o servidor da clínica será uma entrega posterior.

### Isolamento e instalações existentes

Os projetos padrão são `erp-dents-prod`, `erp-dents-dev` e `erp-dents-homolog`, com volumes independentes. Nomes diferentes de containers, sozinhos, não separam os dados. Não reutilize `COMPOSE_PROJECT_NAME` ou `--project-name` entre ambientes.

**Se já havia uma instalação antes desta mudança**, mudar o nome do projeto pode fazer o Compose criar volumes vazios. Antes de atualizar, identifique o nome anterior e os volumes com `docker compose ls` e `docker volume ls`; faça backup. Para preservar a instalação existente, use explicitamente o nome anterior:

```powershell
docker compose --project-name NOME_ANTERIOR up -d --build
```

Não execute o comando com o texto `NOME_ANTERIOR` literalmente. A migração de volumes deve ser planejada, e volumes antigos não devem ser apagados para solucionar falhas de inicialização. O script de homologação fixa seu próprio nome de projeto e não utiliza esses dados.

## Stack

- Frontend: React + TypeScript + Vite
- UI: Tailwind (componentes estilo shadcn/ui)
- Fetch/cache: TanStack Query
- Backend: FastAPI + Pydantic + SQLAlchemy 2.x + Alembic
- Banco: Postgres
- Arquivos de exames: filesystem do servidor (`/data/exams/{patient_id}`)
- Deploy: Docker Compose (dev e prod)
- CI (exemplo): Jenkinsfile

## Arquitetura

- `apps/api/src/core`: domínio + casos de uso + ports (não depende de FastAPI/SQLAlchemy/Postgres)
- `apps/api/src/adapters`: implementações dos ports (Postgres, JWT, filesystem)
- `apps/api/src/api`: routers FastAPI + schemas + deps
- `apps/web`: aplicação web React

## Estrutura do repositório

```text
.
├── apps
│   ├── api
│   │   ├── alembic
│   │   ├── scripts
│   │   └── src
│   │       ├── api
│   │       ├── adapters
│   │       └── core
│   └── web
├── .env.example
├── docker-compose.dev.yml
├── docker-compose.yml
└── Jenkinsfile
```

## Funcionalidades MVP

- Autenticação JWT (login com e-mail/senha; novas senhas com bcrypt-SHA256, hashes bcrypt existentes preservados)
- Sessões revogáveis no servidor: `POST /api/auth/logout` encerra o login atual; troca/reset de senha encerra todos os acessos da conta.
- Bootstrap de admin inicial:
  - `GET /api/auth/needs-bootstrap`
  - `POST /api/auth/bootstrap-admin`
- CRUDs:
  - Pacientes
  - Dentistas
  - Consultas
  - Usuários (apenas admin)
- Agenda com calendário (day/week/month)
- Exames por paciente:
  - Listagem
  - Upload multipart
  - Download; prévia de imagens PNG/JPG
- Regra de conflito de agenda:
  - Bloqueia overlap para o mesmo dentista quando `status != cancelled`

## Endpoints principais

Swagger/OpenAPI disponível em `http://localhost:8000/docs`.

Rotas base:

- `/api/auth`
- `/api/patients`
- `/api/dentists`
- `/api/users`
- `/api/appointments`
- `/api/patients/{patient_id}/exams`
- `/api/exams/{exam_id}/download`

## Pré-requisitos

### Desenvolvimento local

1. Docker Desktop instalado e rodando
2. Git instalado

### Servidor de produção local (24/7)

1. Docker Engine + Docker Compose plugin instalados
2. Git (ou cópia por ZIP)
3. Rede local configurada

## Passo a passo DEV (iniciante)

### 1. Clonar o projeto

```bash
git clone <URL_DO_SEU_REPO>
cd ERP\ Dents
```

### 2. Criar `.env`

Copie o exemplo:

```bash
cp .env.example .env
```

No Windows PowerShell, se preferir:

```powershell
Copy-Item .env.example .env
```

### 3. Ajustar variáveis mínimas

No PowerShell, gere as duas chaves locais antes da primeira inicialização:

```powershell
./scripts/configure-bootstrap.ps1 -EnvFile .env -VariableName JWT_SECRET_KEY
./scripts/configure-bootstrap.ps1 -EnvFile .env
```

Os comandos gravam valores aleatórios no arquivo sem imprimi-los e preservam valores já preenchidos. Se seu arquivo antigo ainda contém o exemplo `CHANGE_ME...`, esvazie apenas `JWT_SECRET_KEY` antes de gerar a chave. Não substitua uma chave válida de uma instalação existente. A API rejeita chave vazia, menor que 32 caracteres ou iniciada por `CHANGE_ME`. O prazo `JWT_EXPIRE_MINUTES` deve estar entre 1 e 10080 minutos.

No `.env`, valide principalmente:

- `JWT_SECRET_KEY` (troque por segredo forte)
- `VITE_API_URL` (dev normalmente `http://localhost:8000`)
- `CORS_ORIGINS` (inclua origem do frontend)

### 4. Subir tudo com 1 comando

```bash
docker compose -f docker-compose.dev.yml up --build
```

Se quiser em background:

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

### 5. Acessar

- Web: `http://localhost:3000`
- API health: `http://localhost:8000/health`
- Swagger: `http://localhost:8000/docs`

### 6. Criar admin inicial

1. Abra `http://localhost:3000`
2. Na tela de login, se o banco estiver vazio, aparecerá "Criar admin inicial"
3. Crie o admin
4. Faça login

## Fluxo de desenvolvimento diário

### Ver logs

```bash
docker compose -f docker-compose.dev.yml logs -f
```

Logs de um serviço específico:

```bash
docker compose -f docker-compose.dev.yml logs -f api
docker compose -f docker-compose.dev.yml logs -f web
docker compose -f docker-compose.dev.yml logs -f db
```

### Parar ambiente

```bash
docker compose -f docker-compose.dev.yml down
```

### Rebuild após alteração de dependências

```bash
docker compose -f docker-compose.dev.yml up --build
```

## Produção local no servidor 24/7

## 1. Preparar servidor

Instale Docker e Compose plugin.

Exemplo (Ubuntu, ajuste se necessário):

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
```

## 2. Copiar projeto para o servidor

Opção A (git clone):

```bash
git clone <URL_DO_SEU_REPO>
cd ERP\ Dents
```

Opção B: copiar pasta do projeto por rede/pendrive.

## 3. Configurar `.env` de produção

```bash
cp .env.example .env
```

Ajuste os campos principais:

- `JWT_SECRET_KEY`: obrigatório trocar
- `PUBLIC_API_URL`: URL que o navegador cliente usará para API
  - Exemplo: `http://192.168.0.50:8000`
- `CORS_ORIGINS`: inclua origem do web em produção
  - Exemplo: `http://192.168.0.50:8080`
- `WEB_PROD_PORT`: padrão `8080`

## 4. Subir produção

```bash
docker compose up -d --build
```

## 5. Descobrir IP do servidor

Linux:

```bash
ip a
```

Windows:

```powershell
ipconfig
```

Use o IP da rede local (exemplo `192.168.0.50`).

## 6. Acesso dos outros PCs na rede

- Web: `http://IP_DO_SERVIDOR:8080`
- API/Docs: `http://IP_DO_SERVIDOR:8000/docs`

## 7. Firewall/portas

Liberar (se necessário):

- `8080/tcp` (frontend)
- `8000/tcp` (API)

## Backup

## Backup do Postgres (produção)

```bash
docker exec -t erp_dents_db pg_dump -U erp_user -d erp_dents > backup_postgres.sql
```

Restaurar:

```bash
cat backup_postgres.sql | docker exec -i erp_dents_db psql -U erp_user -d erp_dents
```

## Backup da pasta de exames

Copiar exames do container da API:

```bash
docker cp erp_dents_api:/data/exams ./backup_exams
```

Restaurar exames:

```bash
docker cp ./backup_exams/. erp_dents_api:/data/exams/
```

## Atualização da aplicação

```bash
git pull
docker compose up -d --build
```

## Troubleshooting

### Porta ocupada

Erro comum: `port is already allocated`.

1. Troque portas no `.env` (`WEB_PORT`, `API_PORT`, `WEB_PROD_PORT`, `POSTGRES_PORT`)
2. Suba novamente:

```bash
docker compose -f docker-compose.dev.yml up --build
```

ou produção:

```bash
docker compose up -d --build
```

### Ativação do primeiro administrador

Em uma instalação nova, prepare `.env` a partir de `.env.example` e gere o código no PowerShell, na pasta do projeto:

```powershell
./scripts/configure-bootstrap.ps1 -EnvFile .env -VariableName JWT_SECRET_KEY
./scripts/configure-bootstrap.ps1 -EnvFile .env
```

O script grava `BOOTSTRAP_TOKEN` no arquivo local sem mostrar seu valor e preserva códigos existentes. Suba o Compose escolhido; se a API já estiver rodando, recrie seu container para carregar a configuração. Abra `.env` localmente no servidor e copie somente o valor dessa variável para **Código de ativação**, na configuração inicial da tela de acesso. Preencha nome, e-mail e senha do primeiro administrador.

Na homologação, `./scripts/homolog.ps1 -Action up` gera automaticamente `HOMOLOG_BOOTSTRAP_TOKEN` em `.env.homolog`. Use esse valor somente naquele ambiente. Não publique arquivos de ambiente nem compartilhe o código com os computadores clientes.

Código ausente ou incorreto impede a ativação. A configuração manual exige pelo menos 32 caracteres; o gerador produz 64 caracteres aleatórios. O script não substitui valores já preenchidos, mesmo inválidos: nesse caso, esvazie apenas a variável de ativação e execute-o novamente antes de recriar a API.

A criação inicial é única e registrada no banco. Após concluída, o código pode ser removido do arquivo de ambiente e a API recriada; ele não permite criar outro administrador ou reabrir a instalação. Instalações que já possuem usuários continuam usando o login habitual, sem precisar desse código.

Evidências e testes: [etapa 1C.2](docs/homologacao-etapa-1C2.md). O instalador assistido e HTTPS estão previstos na etapa 5.

### "Criar admin inicial" não aparece

Se a instalação já foi concluída ou existe usuário no banco, a configuração inicial fica bloqueada. A migração também marca bancos existentes como configurados. Excluir usuários não reabre essa configuração.

Teste:

```bash
curl http://localhost:8000/api/auth/needs-bootstrap
```

### Reset de senha de admin

A redefinição invalida todos os acessos existentes da conta. O usuário precisará entrar novamente com a nova senha.

Com ambiente rodando:

```bash
docker compose exec api python scripts/reset_admin_password.py admin@clinica.com
```

O terminal solicita a nova senha e a confirmação sem exibi-las. O comando pode redefinir qualquer conta localizada por e-mail, apesar do nome histórico do arquivo. Não passe senha como argumento: esse formato é rejeitado sem repetir o valor na mensagem de erro. Para automação controlada, há `--password-stdin`; alimente o processo por entrada padrão, evitando `echo`, histórico ou logs com credenciais.

### Sessões e atualização para a etapa 1C.3

A migração `0009_auth_sessions` preserva usuários e dados, mas exige novo login de quem estava conectado antes da atualização. Cada login recebe uma sessão independente no banco; sair de um computador não encerra os demais logins. Abas do mesmo navegador que compartilham a sessão saem juntas.

Trocar ou redefinir senha, inativar a conta, alterar e-mail, perfil ou vínculo com dentista invalida as sessões existentes dessa conta. Reativar não recupera acessos antigos. Reiniciar o servidor preserva tanto sessões válidas quanto revogações. Sessões expiradas são descartadas do banco nos próximos logins.

O botão **Sair** aguarda confirmação do servidor. Se a conexão falhar, os dados ficam ocultos e a tela oferece **Tentar sair novamente**; a saída não é confirmada enquanto a API não responder. Alterar a senha também exige novo login. Uma senha atual digitada incorretamente mantém a sessão e mostra erro de validação.

A revogação é conferida nas próximas requisições autenticadas. Ela não desfaz operações já autorizadas nem apaga imediatamente dados já exibidos em outro computador parado. Tokens continuam em `localStorage`, cuja revisão permanece pendente. Evidências: [homologação 1C.3](docs/homologacao-etapa-1C3.md).

### Senhas e limites de tentativas — etapa 1C.4

Novas senhas devem ter de 8 a 128 caracteres, sem caractere nulo. Espaços e Unicode são aceitos; a senha não é aparada ou normalizada. Novos cadastros, bootstrap, troca e redefinição usam bcrypt-SHA256 para considerar a senha inteira. Os hashes bcrypt existentes continuam sendo verificados, sem regravação automática. Uma senha antiga com mais de 72 bytes ainda tem a limitação do bcrypt até ser explicitamente trocada/redefinida; a atualização não consegue recuperar o trecho que o hash antigo descartou.

Os limites abaixo usam janelas de 60 segundos desde a primeira tentativa e contam tentativas válidas e inválidas:

| Operação | Limite |
|---|---|
| Login por conta, normalizada por e-mail | 10 |
| Login por origem da conexão | 120 |
| Ativação inicial por origem | 10 |
| Troca de senha por usuário autenticado | 5 |

Ao exceder o limite, a API retorna 429 com `Retry-After` e informa que é necessário aguardar. Não há bloqueio permanente nem necessidade de reiniciar: a janela expira automaticamente. Contadores são compartilhados no PostgreSQL, sobrevivem a reinícios e não armazenam e-mails/IPs em texto aberto. Tentativas recusadas não prorrogam a janela. Login inexistente, senha incorreta e usuário inativo recebem a mesma mensagem.

A origem é o endereço da conexão recebido pela API. Os comandos Docker desabilitam interpretação automática de cabeçalhos de proxy para evitar falsificação. Computadores atrás do mesmo NAT/proxy podem compartilhar o limite de origem; o limite por conta continua independente. A instalação futura com proxy/HTTPS deverá configurar origem confiável explicitamente, sem aceitar cabeçalhos arbitrários.

A migração `0010_auth_attempts` não altera senhas ou dados existentes. Mantenha a chave JWT válida no servidor após a ativação; ela não é o código descartável de bootstrap. Detalhes e testes: [homologação 1C.4](docs/homologacao-etapa-1C4.md).

### Ver logs

DEV:

```bash
docker compose -f docker-compose.dev.yml logs -f
```

PROD:

```bash
docker compose logs -f
```

### CORS bloqueando requisições

Ajuste `CORS_ORIGINS` no `.env` com os domínios corretos do frontend.

Exemplo:

```env
CORS_ORIGINS=http://localhost:3000,http://192.168.0.50:8080
```

Depois:

```bash
docker compose up -d --build
```

## Docker Compose

- `docker-compose.dev.yml`
  - Hot reload API e web
  - Volumes para código + persistência
- `docker-compose.yml`
  - Web em Nginx (porta 80 interna, exposta em `WEB_PROD_PORT`)
  - API em `8000`
  - Volumes persistentes para Postgres e exames

## Variáveis de ambiente (resumo)

Veja `.env.example` para lista completa.

Principais:

- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `JWT_EXPIRE_MINUTES`
- `CORS_ORIGINS`
- `EXAMS_BASE_PATH`
- `VITE_API_URL` (dev)
- `PUBLIC_API_URL` (build produção do frontend)

## Convenção de commits (sugestão)

Use Conventional Commits (sugestão, sem tooling obrigatório):

- `feat: adiciona CRUD de pacientes`
- `fix: corrige validação de conflito de agenda`
- `docs: atualiza passo a passo de deploy`
- `chore: ajusta compose de produção`

## Jenkins (opcional)

Existe um `Jenkinsfile` de exemplo com estágios:

1. Checkout
2. Lint/Test API
3. Lint/Test web
4. Docker build

## Observações importantes

- Clientes nunca acessam Postgres diretamente.
- Apenas backend escreve em banco e filesystem de exames.
- Lógica de negócio (conflito de agenda, bootstrap, validações) está nos use cases do core.

## Comandos rápidos

### DEV subir

```bash
docker compose -f docker-compose.dev.yml up --build
```

### DEV derrubar

```bash
docker compose -f docker-compose.dev.yml down
```

### PROD subir

```bash
docker compose up -d --build
```

### Swagger

```text
http://localhost:8000/docs
```


### Exames — etapa 1D.1

Novos envios aceitam PDF, JPG e PNG até 20 MiB por arquivo. Defina `EXAM_MAX_BYTES=20971520` no arquivo de ambiente do servidor (ou `.env.homolog` na homologação) e recrie a API para alterar o limite. A tela consulta o valor configurado e oferece progresso e cancelamento. Cancelar pode ocorrer após o processamento; confira a lista atualizada.

A prévia é exclusiva para PNG/JPG. PDFs e arquivos antigos ficam disponíveis por download. O ClamAV local verifica novos envios e downloads, inclusive legados; se estiver indisponível ou desatualizado, o arquivo não é liberado. A verificação não garante que todo documento esteja correto ou seja renderizável.

Exclusões confirmadas no banco entram em uma fila de remoção física, retomada na inicialização da API e nas exclusões. Para tentar novamente manualmente na homologação:

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml exec api python -m scripts.cleanup_exam_files
```

Em outro ambiente, use seu projeto, arquivo de ambiente e Compose correspondentes. O comando acima processa até 1.000 intenções registradas. A manutenção automática, a cada cinco minutos, também move órfãos com pelo menos 24 horas para uma quarentena recuperável, sem apagá-los.

`EXAM_QUOTA_BYTES` define a quota total (padrão: 50 GiB), incluindo a quarentena. O gateway limita tamanho, tempo e envios simultâneos, mantendo a URL da API. Os três Compose incluem gateway e antivírus; o ClamAV tem limite de 4 GiB de RAM e precisa atualizar assinaturas pela internet. Foram usados aproximadamente 8 GiB disponíveis ao Docker na homologação.

Diagnóstico, recuperação de arquivos e evidências: [operação de exames](docs/operacao-exames.md). O ensaio completo de backup/restauração continua na etapa 5; estas rotinas preservam os dados e não substituem uma cópia de segurança.
