# Sessão e acesso HTTPS

## Endereço nos computadores da clínica

O destino é um único endereço HTTPS para abrir no navegador. A interface e `/api` usam a mesma origem; o serviço `edge` termina TLS e encaminha a API pelo gateway de uploads. Na composição de produção, web, gateway e API não publicam portas individuais.

Configuração de produção no `.env` local:

```dotenv
PUBLIC_ORIGIN=https://erp.clinica.local
HTTPS_PORT=443
TLS_DIRECTORY=./.data/tls/prod
```

O diretório deve conter `server.crt` (certificado/cadeia PEM) e `server.key` (chave PEM), legíveis pelo Nginx. O certificado precisa cobrir o nome/IP utilizado, estar válido e ser confiável em cada computador. Proteja a chave no servidor; não a distribua aos clientes nem a envie ao Git. Não use a CA de homologação em uma clínica.

O DNS ou resolução local deve apontar o nome escolhido para o servidor. A origem não inclui caminho/barra final; porta não padrão deve aparecer em `PUBLIC_ORIGIN`. A API rejeita origem HTTP na configuração e requisições de escrita vindas de outra origem. Cabeçalhos de proxy não definem essa confiança.

Instalação assistida, emissão/renovação de certificados, firewall da clínica, atalhos e distribuição de confiança seguem na etapa 5. Esta etapa fornece a estrutura de transporte e autenticação; não constitui instalação em produção.

## Homologação local

1. Com Python e OpenSSL disponíveis (Git para Windows inclui OpenSSL), execute `python scripts/prepare_homolog_tls.py`.
2. Execute `./scripts/homolog.ps1 -Action up`.
3. Importe **somente** `.data/tls/homolog/ca.crt` nas autoridades confiáveis do usuário de teste. No Windows, `certutil -user -addstore Root .data/tls/homolog/ca.crt` pode pedir confirmação do usuário.
4. Abra **https://localhost:18443** em Chrome/Edge atualizado. Não ignore avisos de certificado.

A CA local não conserva sua chave privada; o certificado do servidor vale 90 dias. Arquivos existentes são preservados. Para renovar, prepare novo conjunto em uma intervenção controlada, substitua a confiança nos computadores de teste e reinicie `edge`; o script recusa conjuntos parciais. Não apague volumes para corrigir certificado.

Para desenvolvimento, `python scripts/prepare_homolog_tls.py --environment dev` prepara outro conjunto; o Compose de desenvolvimento expõe HTTPS em `https://localhost:19443`. Ao reutilizar `.env` de produção, ajuste `PUBLIC_ORIGIN` e `TLS_DIRECTORY` para desenvolvimento. Portas HTTP de homologação/desenvolvimento são interfaces locais de diagnóstico; use HTTPS na interface.

Homologação e desenvolvimento têm nomes de cookie diferentes; cookies não se isolam por porta. Na rede, use hosts distintos para cada ambiente. Não compartilhe chaves JWT, banco ou arquivos clínicos entre ambientes.

## Contrato da sessão

- `GET /api/auth/session` recupera usuário, expiração, marcador de sessão e token CSRF. Não retorna a credencial de autenticação.
- `GET /api/auth/challenge` prepara a proteção anterior a login/bootstrap.
- Login define cookie `__Host-*`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sem `Domain`.
- Operações protegidas enviam `X-Session-ID`, marcador que não autentica sozinho; escritas também enviam `X-CSRF-Token` vinculado ao cookie e origem válida. Login/bootstrap usam o desafio anterior à autenticação. Referer é alternativa estrita quando Origin está ausente.
- JWT não aparece no corpo do login, localStorage ou sessionStorage. O navegador compartilha somente um marcador sem poder de autenticação. CSRF permanece em memória.
- A tabela `auth_sessions` continua sendo a autoridade de revogação/expiração. Senhas e dados existentes são preservados. Tokens antigos, sem o novo identificador de transporte, são rejeitados; bearer não é aceito nas rotas de navegador. A atualização exige novo login.
- Logout revoga a sessão no servidor, sem `Set-Cookie` de exclusão: assim, uma resposta atrasada não apaga o cookie de um login mais recente. O cookie revogado permanece até expirar/substituir, sem conceder acesso. Novo carregamento confirma a revogação no servidor.
- Web Locks coordenam inicialização/login entre abas. Cabeçalhos vinculam operações à sessão esperada; uma aba antiga não pode gravar com o cookie novo. Cache/formulários são descartados na troca de sessão. Falha de logout oculta dados e oferece tentativa novamente.
- Respostas da API usam `no-store`. Cookies não eliminam riscos de XSS; um script executado na origem ainda pode fazer requisições, mesmo sem ler a credencial.

## Verificação e retomada

```powershell
python scripts/smoke_cookie_homolog.py
python scripts/smoke_sessions_homolog.py
python scripts/smoke_exam_gateway_homolog.py
```

O primeiro verifica TLS com a CA explícita, cookies reais, CSRF e troca de sessão. O segundo usa API/schema descartáveis para revogação. O terceiro exercita os limites através do novo acesso HTTPS; execute sem outros uploads simultâneos.

`scripts/smoke_browser_homolog.cjs` usa Playwright disponível localmente e Chrome, sem ignorar TLS. Defina `PLAYWRIGHT_MODULE` se o pacote não estiver no caminho padrão de módulos. Ele lê somente as credenciais fictícias locais e salva capturas em `.data/homolog`. O teste de navegador exige que a CA já seja confiável no Windows.

Git sincroniza código e roteiro. Certificados, chaves, `.env`, credenciais fictícias, backups e volumes permanecem locais e devem ser preparados no outro computador.
