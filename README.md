# ERP Dents (MVP)

Monorepo para clínica pequena de ortodontia com arquitetura cliente-servidor, backend FastAPI (Clean Architecture Hexagonal), frontend React e persistência em Postgres + filesystem para exames.

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

- Autenticação JWT (login com e-mail/senha, hash bcrypt)
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
  - Download/abrir no navegador
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

### "Criar admin inicial" não aparece

Se já existe usuário no banco, o bootstrap é bloqueado por regra.

Teste:

```bash
curl http://localhost:8000/api/auth/needs-bootstrap
```

### Reset de senha de admin

Com ambiente rodando:

```bash
docker compose exec api python scripts/reset_admin_password.py admin@clinica.com NovaSenha123
```

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
