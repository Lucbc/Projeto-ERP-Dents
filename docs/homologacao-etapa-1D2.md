# Homologação 1D.2 — dependências e builds

Data: 17/09/2026. Base publicada: `2d179c5`. Ambiente: `erp-dents-homolog`, exclusivamente fictício. Validação local concluída; primeira execução remota do workflow será registrada após a publicação.

## Resultado

Dependências diretas e transitivas fixadas; builds falham quando o lock está incompatível ou a integridade não confere. API, frontend e banco atualizados de forma compatível, preservando os volumes e o conteúdo anterior. Achado R35 tratado; R36 recebe execução automática dos testes existentes, sem afirmar cobertura de todas as regras ainda pendentes da revisão.

| Área | Alteração |
|---|---|
| Python | `requirements.in` + lock universal com hashes, uv 0.12.15, Python 3.12 |
| API | FastAPI 0.141.1, Starlette 1.6.0 resolvida pela faixa do FastAPI, multipart 0.0.32; SQLAlchemy/psycopg/Alembic atualizados |
| Autenticação | PyJWT 2.14.0 substitui python-jose/ecdsa; HS256 e sessões persistentes mantidos; hashes de senha legados preservados |
| Web | Node 24.21.0 no Docker, dependências diretas exatas e `package-lock.json`; React Router 7.18.4, Vite 7.3.6, Vitest 4.1.11; React permanece 18 |
| Docker | Bases fixadas por digest, API Alpine sem compilador/pip, processo UID 10001; inicialização explícita de permissões do volume |
| PostgreSQL | Atualização 16.13 → 16.15; sem mudança de versão principal ou migração de esquema |
| Automação | GitHub Actions em push/PR/semanal, ações fixadas por SHA, ferramentas de auditoria com lock, testes PostgreSQL/HTTP/ClamAV e auditoria das imagens |

### Decisões de segurança

A atualização de bibliotecas Python não elimina avisos da distribuição Linux. A imagem Debian avaliada ainda continha achados; a API foi migrada para Alpine e recebeu `libuuid=2.42.3-r1`. A imagem PostgreSQL oficial atual também tinha bibliotecas vulneráveis e um `gosu` compilado com Go antigo. A imagem derivada fixa `libssl3/libcrypto3=3.5.8-r0`, `libuuid=2.42.3-r1` e `su-exec=0.3-r0`. O entrypoint conserva seu fluxo e usa `su-exec` somente no ponto em que troca para o usuário postgres; o binário gosu é removido. O build verifica a presença desse ponto antes de alterá-lo.

O init de exames roda como root somente para preparar o volume montado, recusando caminhos genéricos/não montados e ignorando links. A API executa depois, como usuário restrito. Arquivos existentes permanecem com os mesmos bytes. O processo não substitui backup nem migra volumes entre projetos.

Fixar a versão de um pacote Alpine faz o build falhar se ela deixar de estar disponível no repositório. Nesse caso, revisar a atualização e repetir auditoria/testes; não remover a fixação silenciosamente. Locks reduzem variação de dependências, mas não prometem imagens binariamente idênticas nem disponibilidade eterna dos registries.

## Evidências locais

| Verificação | Resultado |
|---|---|
| Backend completo na imagem Alpine | **81 testes aprovados**: 78 anteriores + 3 de compatibilidade JWT |
| Frontend | **34 testes aprovados**, TypeScript e build Vite aprovados |
| Instalação/build | `npm ci` Windows e Linux; pip com hashes e `pip check`; imagens de produção e Dockerfiles de desenvolvimento construídos |
| Fluxo geral HTTP | **10 grupos aprovados**, incluindo login, cadastros, agenda, financeiro e exame PNG |
| Sessões/autenticação HTTP | **12 + 13 grupos aprovados**, migrações em schemas descartáveis e reinícios incluídos |
| Exames HTTP | **12 grupos aprovados**; tipos/tamanho, autorização, download e exclusões |
| Operação de exames | **12 grupos + 9 de antivírus indisponível**; EICAR real, quota concorrente, bloqueio de exclusão, quarentena periódica e recuperação de bytes |
| Permissões do volume | Volume novo descartável: leitura/gravação UID 10001, bytes preservados, links ignorados, caminhos perigosos recusados, timezone São Paulo disponível, sem pip/gcc |
| Banco novo | Inicialização em tmpfs, troca para usuário postgres, criação de tabela e leitura/gravação aprovadas na imagem derivada |
| Atualização do banco existente | Todas as tabelas de negócio comparadas por fingerprint antes/depois; sessões/tentativas excluídas da comparação por serem transitórias; arquivos comparados por SHA-256 |
| JWT anterior | Login criado com a imagem antiga aceito pela nova API; logout confirmado e token revogado |
| Navegador | Login, painel, pacientes, rota direta recarregada, exames/prévia PNG, calendário, financeiro existente de R$ 150 e logout conferidos no Chrome |

No roteiro local de atualização, a expectativa inicial do status de logout era 204, mas o contrato existente retorna 200. A chamada realizou o logout; a conferência subsequente confirmou 401 para o token revogado. Foi uma correção do roteiro de teste, não alteração da API.

Os três testes JWT também verificam token HS512 corretamente assinado, assinatura errada, expiração, formato inválido e algoritmo `none`. Não foi necessário invalidar senhas ou sessões existentes para trocar a biblioteca.

### Auditorias

- Antes: quatro entradas npm afetadas (React Router e Vitest com suas dependências); Python com 33 ocorrências brutas em quatro pacotes. Quantidades brutas podem repetir IDs/avisos e não provam explorabilidade de cada falha.
- Depois: **zero avisos conhecidos** nas árvores npm/Python consultadas e **zero achados** nas cinco imagens finais de execução (API, web, gateway, PostgreSQL e ClamAV), segundo a base consultada em 17/09/2026.
- Ferramentas: pip-audit 2.10.1, npm audit, Trivy 0.74.0 fixado por digest. Relatórios completos locais em `.data/security`. A inspeção das imagens é local; scanners consultam bases de vulnerabilidades, sem enviar banco, exames ou `.env`.
- Nenhuma exceção de CVE nem `--ignore-unfixed` utilizada. A auditoria de pacotes falha com avisos/erro de serviço; a de imagens bloqueia HIGH/CRITICAL. Novos avisos poderão fazer a execução semanal falhar e exigir atualização.

## Preservação e estado operacional

- Cópias anteriores à atualização: `.data/homolog/pre-1D2.dump` e `pre-1D2-exams.tar`. Mantidas somente neste computador; não publicadas e ainda sem ensaio completo de restauração.
- Banco permanece em `0011_exam_file_deletions`. Nenhuma migração de domínio foi adicionada nesta entrega.
- Configurações/segredos anteriores preservados. Serviços de homologação ativos nas portas 18080/18000, vinculadas ao localhost. `exam-storage-init` com saída 0 é esperado.
- Os testes removem somente seus schemas, containers e volumes descartáveis; volumes principais e os de outros projetos permanecem intactos.

## Repetir a validação

Com Docker ativo e configuração local de homologação já criada:

```powershell
./scripts/homolog.ps1 -Action up
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 -e RUN_CLAMAV_TESTS=1 api python -m unittest discover -s tests -v
npm ci --prefix apps/web
npm test --prefix apps/web -- --maxWorkers=1
npm run build --prefix apps/web
python scripts/smoke_homolog.py
python scripts/smoke_sessions_homolog.py
python scripts/smoke_auth_hardening_homolog.py
python scripts/smoke_exams_homolog.py
python scripts/smoke_exam_operations_homolog.py
python scripts/smoke_storage_init_homolog.py
```

Os smokes HTTP são sequenciais: compartilham a porta 18001. Para auditoria, use o ambiente de ferramentas e os comandos no README. Não imprimir a saída resolvida de `docker compose config`, que contém segredos.

## Limites e próximo recorte

Auditorias são uma fotografia dos avisos conhecidos, não garantia de ausência de falhas. O bundle web mantém o aviso de tamanho acima de 500 kB; o fatiamento das páginas fica na revisão de desempenho. A data de nascimento ainda aparece com um dia a menos, achado anterior da etapa 3. Não houve implantação em produção.

Próximo recorte: **1D.3 — tratamento de erros e fechamento de segurança**, incluindo mensagens internas, consistência das exceções e decisão explícita sobre o armazenamento do token no navegador. HTTPS e instalação/backup assistidos continuam na etapa 5. Concorrência de agenda/cobrança permanece na etapa 2.

## Referências das decisões

- [Compatibilidade de versões FastAPI/Starlette](https://fastapi.tiangolo.com/deployment/versions/).
- [API PyJWT e algoritmo de verificação explícito](https://pyjwt.readthedocs.io/en/stable/api.html).
- [Geração de locks e hashes com uv](https://docs.astral.sh/uv/pip/compile/).
- [Linhas de versão Node.js](https://nodejs.org/en/about/previous-releases) e [suporte Vite](https://vite.dev/releases).
- [Aviso React Router](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) e [aviso Vitest](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).
