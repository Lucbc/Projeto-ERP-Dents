# Homologação — etapa 1C.4

Entrega de 16/09/2026, base `877956b`. Escopo: senhas, limites de tentativas e configuração de autenticação (R12; partes de R03/R07). Somente `erp-dents-homolog` e dados fictícios.

## Alterações

- Política central de novas senhas: 8 a 128 caracteres Unicode, sem caractere nulo/Unicode inválido. Espaços são preservados. Aplicada ao bootstrap, criação, troca, redefinição administrativa e comando local. Formulários contam caracteres Unicode como o backend.
- Novos hashes usam `bcrypt_sha256` do Passlib, que considera o conteúdo após o byte 72. O verificador também aceita os hashes bcrypt existentes, sem regravá-los automaticamente. Removida implementação duplicada de `JwtAuthService` em `security/__init__.py`, preservando a exportação pública.
- Login de conta inexistente, senha incorreta ou conta inativa retorna a mesma mensagem/401. Conta inexistente também executa verificação contra hash auxiliar, reduzindo a diferença óbvia de custo. Não se afirma igualdade absoluta de tempo entre todos os caminhos.
- `auth_attempts` armazena contadores por janela e identificadores derivados por HMAC; não grava e-mail/IP em texto aberto. Reservas são serializadas em transações curtas antes da verificação da senha. Não segura o bloqueio durante bcrypt. Limites valem entre workers e reinícios.
- Limites de 60 segundos: login 10 por conta e 120 por origem; ativação 10 por origem; troca de senha 5 por usuário. Contam sucessos e falhas. Excesso retorna 429/`Retry-After`, sem estender a janela por novas requisições bloqueadas. Registros expirados são removidos nas próximas reservas; pedidos bloqueados não criam novas identidades no contador.
- Docker executa Uvicorn com `--no-proxy-headers`; cabeçalhos enviados pelo cliente não alteram a origem considerada. Endereços compartilhados por NAT/proxy compartilham o orçamento de origem. O orçamento por conta é independente.
- API rejeita chave JWT vazia, curta, só espaços ou iniciada por `CHANGE_ME`; valida expiração entre 1 e 10080 minutos. Gerador PowerShell aceita `JWT_SECRET_KEY`, preserva valores existentes e não imprime o segredo. `.env.example` deixa essa chave vazia para geração local.
- Recuperação local solicita senha/confirmação com entrada oculta ou recebe `--password-stdin` para automação. Argumento antigo é rejeitado sem ecoar seu valor. Terminal incapaz de ocultar entrada não continua em modo visível. Revogação das sessões após redefinição permanece ativa.

## Testes

| Verificação | Resultado |
|---|---|
| Backend/PostgreSQL | 49 testes distintos aprovados: 38 anteriores e 11 de proteção de autenticação |
| Frontend | 28 testes aprovados: sessão, ativação, excesso de comprimento, Unicode e resposta 429 |
| HTTP de proteção de autenticação | 13 grupos aprovados em API/schema descartáveis |
| HTTP de sessões | 12 grupos aprovados novamente com os novos hashes/limites |
| Fluxo integrado existente | 10 grupos aprovados: login, cadastros, agenda, financeiro e exames |
| PowerShell | Geração de JWT/ativação, preservação, idempotência e duplicidade verificadas |
| Build Docker | API/web construídas; TypeScript/Vite e Nginx aprovados |

A rodada completa passou inicialmente com 48 testes. Os 11 testes de autenticação foram executados novamente após os ajustes finais de Unicode, espaços na chave e recusa de entrada visível. Isso totaliza 49 testes distintos, sem somar repetições. Não foi realizada nova inspeção visual no navegador nesta etapa; interface validada por componentes e build. A entrada padrão do comando local foi exercitada com banco isolado; a recusa do fallback visível foi testada com simulação controlada.

Os testes HTTP enviaram 12 logins simultâneos para a mesma conta: 10 chegaram à verificação e 2 receberam 429. A normalização do e-mail, `Retry-After`, reinício real do container, expiração da janela e tentativa de falsificar `X-Forwarded-For`/`X-Real-IP` foram verificados. Para testar o limite por origem sem executar 120 hashes, o teste preencheu o contador exclusivamente em seu schema descartável e comprovou o bloqueio de outra conta. A expiração foi avançada somente nesse schema.

## Reprodução

```powershell
./scripts/test-configure-bootstrap.ps1
./scripts/homolog.ps1 -Action up
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 api python -m unittest discover -s tests -v
npm test --prefix apps/web
./apps/api/.venv/Scripts/python.exe scripts/smoke_auth_hardening_homolog.py
./apps/api/.venv/Scripts/python.exe scripts/smoke_sessions_homolog.py
./apps/api/.venv/Scripts/python.exe scripts/smoke_homolog.py
```

Os dois testes HTTP isolados usam a porta 18001: execute-os sequencialmente. Cada um remove seu container, schema e arquivo temporário de segredos. O Python local pode ser substituído pelo ambiente Python de outro computador. Relatórios ficam em `.data/homolog`, ignorados pelo Git.

## Migração e compatibilidade

- `0010_auth_attempts (head)` aplicada na homologação após testes isolados. Cópia prévia `.data/homolog/pre-1C4.dump` cobre somente banco, não exames; não valida recuperação completa.
- Contas, senhas, registros fictícios e volumes anteriores preservados. Login com a credencial anterior confirmado pelo fluxo geral. Esta migração não exige trocar senhas ou eliminar sessões existentes.
- Hashes bcrypt antigos ainda têm a limitação de 72 bytes. O trecho descartado não pode ser recuperado pela atualização; a correção completa daquela credencial ocorre ao trocar/redefinir explicitamente a senha. Não foi executada rotação das credenciais existentes.
- Novos hashes exigem código compatível. Não reverter para versões que conhecem somente bcrypt; downgrade não homologado. Chave JWT deve permanecer no servidor e ser igual entre instâncias. Alterá-la invalida assinaturas existentes e muda as chaves dos contadores.
- O comando de recuperação atua sobre qualquer conta por e-mail, conforme comportamento anterior; o nome histórico contém `admin`. A trilha de auditoria desse comando permanece pendente junto à auditoria geral.

## Limites e próximo passo

Janelas fixas foram escolhidas por serem previsíveis e não bloquearem permanentemente contas da clínica. Os valores precisam de avaliação com carga real; não há bloqueio progressivo ou proteção completa contra negação de serviço. Atrás de proxy/NAT, vários computadores podem ter a mesma origem. A instalação da etapa 5 deverá definir proxies confiáveis explicitamente. Login por execução manual de Uvicorn deve manter `--no-proxy-headers` até essa definição.

Tokens continuam em `localStorage`. Revisão desse armazenamento, segurança dos exames/dependências, HTTPS, backup completo, instalador e homologação de carga continuam no plano. Esta entrega não representa liberação para produção. O build ainda informa pacote JavaScript acima de 500 kB.

Próximo recorte: **1D.1 — segurança e ciclo de vida dos exames**. Mapear upload, limites, tipos aceitos, download/visualização, autorização e remoção de arquivos antes de alterações; dependências gerais permanecem em recorte separado de 1D.

## Referências de implementação

A compatibilidade de bcrypt e o formato bcrypt-SHA256 foram conferidos na [documentação oficial do Passlib](https://passlib.readthedocs.io/en/stable/lib/passlib.hash.bcrypt_sha256.html). Respostas uniformes e limitação de tentativas seguem os princípios da [orientação de autenticação da OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html). Os números das janelas são decisões deste projeto, não uma exigência dessas referências.
