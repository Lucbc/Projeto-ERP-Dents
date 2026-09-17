# Plano de execução — ERP Dents

## Objetivo

ERP odontológico centralizado, com acesso individual pelo navegador nos computadores da clínica e operação simples do servidor. Referência: [revisão técnica](./revisao-tecnica-2026-09-15.md), base `7401b1a`.

## Como vamos trabalhar

- Cada etapa será dividida em entregas pequenas, implementadas e verificadas antes da próxima.
- Estados: **pendente**, **em andamento**, **concluída** ou **bloqueada**, sempre com motivo/evidência.
- A cada entrega: informar mudanças, testes, limitações e ponto de retomada. Não considerar build como prova de funcionamento completo.
- Registrar progresso aqui antes de mudanças longas e atualizar ao terminar. Uma interrupção deve permitir retomar a partir deste arquivo e do estado Git.
- Ao concluir cada entrega com alterações, fazer commit e push, por solicitação do usuário, para permitir continuar em outros computadores. Conferir exclusão de segredos e igualdade do HEAD local/remoto; não usar force push. Os dados Docker e arquivos locais de credenciais não são sincronizados pelo Git.
- Limites de uso do modelo não são controlados pelo projeto. Não há garantia de impedir uma interrupção; checkpoints persistentes reduzem retrabalho. Não iniciar uma grande migração sem preparar teste e recuperação.
- Usar dados fictícios na homologação. A autorização atual permite construir/subir Docker, homologar e corrigir em etapas; não inclui implantar em uma clínica com dados reais.

## Etapas e critérios de conclusão

| Etapa | Escopo | Estado | Critério |
|---|---|---|---|
| 0 | Ambiente isolado, primeira construção das imagens, migrações e fluxo básico real | Concluída | API/web/banco acessíveis; migrações aplicadas; login, cadastros, agenda, cobrança e exames verificados; evidência registrada |
| 1A | Isolamento dos ambientes e contexto de build | Concluída | Produção, desenvolvimento e homologação resolvem volumes diferentes; arquivos locais não entram no build |
| 1B | Sessão e cache no navegador | Concluída | Troca de usuário/abas sem dados da sessão anterior; expiração/rede tratadas corretamente |
| 1C | Administração, bootstrap e autenticação | Concluída: 1C.1 a 1C.4 | Sem promoção indevida; último administrador protegido; bootstrap exclusivo; sessões revogáveis; segredos/tentativas/senhas tratados; limitações de hashes legados registradas |
| 1D | Exames, erros e dependências de segurança | Em andamento: 1D.1 e 1D.2 concluídas | Limites/tipos e visualização seguros; ciclo de vida consistente; dependências compatíveis verificadas |
| 2A | Concorrência de agenda e cobrança | Pendente | PostgreSQL rejeita conflitos simultâneos; geração idempotente |
| 2B | Edição concorrente e histórico financeiro | Pendente | Alterações não se perdem; baixa idempotente; pagamentos/estornos rastreáveis |
| 3 | Datas, cadastros, permissões, paginação, atualização entre PCs e interação | Pendente | Cenários por perfil e dados representativos aprovados |
| 4 | Atendimento/prontuário e estrutura de cobrança/pagamentos | Pendente | Escopo validado com a clínica; histórico e autoria preservados |
| 5 | Instalação assistida, HTTPS, backup, atualização e recuperação | Pendente | Instalar, reiniciar, atualizar e restaurar em ambiente isolado com roteiro simples |
| 6 | Homologação final, carga, usabilidade e piloto | Pendente | Critérios da revisão atendidos e limitações aceitas explicitamente |

Etapa 1A é pequena e pode ser concluída junto com a preparação da etapa 0. Funcionalidades de prontuário, parcelamento e instalação final terão decisões próprias antes da implementação.

## Entrega atual

**Concluída:** 1D.2 — dependências e builds reproduzíveis, implementação publicada em `a3b281e`, validação local e GitHub Actions aprovadas. Homologação atualizada com dados preservados. Próximo recorte: 1D.3 — tratamento de erros e fechamento de segurança. Ponto de retomada ao final deste arquivo; evidências em [homologação 1D.2](./homologacao-etapa-1D2.md).

### Ponto de retomada — 15/09/2026

- Docker Engine 29.8.0 respondeu; inicialmente nenhum container rodando.
- Não havia volumes ERP Dents. Há volume de outro projeto, que deve ser preservado.
- Relatórios da revisão estão em `docs/` e ainda não estavam versionados no início desta entrega.
- Compose isolado criado, segredos locais gerados, imagens construídas. PostgreSQL e API iniciaram; as sete migrações chegaram a `0007_financial_patient`.
- Bloqueador real corrigido: BOM UTF-8 em `apps/web/nginx.conf` fazia Nginx encerrar com `unknown directive`. Build reconstruído com `nginx -t` aprovado.
- Produção/desenvolvimento receberam nomes de projeto distintos e orientação para instalações preexistentes no README. Configurações resolvidas confirmaram volumes diferentes nos três ambientes.
- Não há banco de produção a migrar neste computador; configurações para instalações antigas devem ser documentadas antes de mudar o nome padrão do projeto.

## Histórico de entregas

- Revisão técnica concluída; 39 achados documentados. Build web e verificações pontuais passaram, sem Docker ativo naquele momento.
- Preparação da etapa 0 iniciada após autorização do usuário e ativação do Docker.
- Etapas 0 e 1A concluídas em 15/09/2026. Evidências: [homologação](./homologacao-etapas-0-1A.md).

### Retomada das etapas 0 e 1A (histórico)

- **Próxima entrega: 1B — sessão e cache.** Ler os achados correspondentes e mapear AuthProvider, cliente HTTP, QueryClient e consultas por usuário. Preparar cenários de logout, troca de usuário, duas abas, expiração e falha de rede. Autenticação do servidor fica na 1C.
- Docker está ativo: web `http://localhost:18080`, API `http://localhost:18000`, ambos restritos ao próprio computador.
- Smoke integrado: 11 verificações na primeira execução; 9 na segunda, mantendo registros fictícios. Login, painel, pacientes e financeiro conferidos no Chrome.
- Reinício dos três serviços preservou login, paciente, consulta, baixa financeira e bytes do exame. Banco em `0007_financial_patient (head)`.
- `.env.homolog` e `.data/homolog/admin.json` são arquivos locais ignorados pelo Git. Não imprimir, publicar nem recriar segredos existentes.
- Data de nascimento incorreta confirmada na interface (15/01 vira 14/01); pendente na etapa 3. Financeiro apresenta rolagem horizontal no viewport observado; revisar responsividade nessa etapa.
- Alterações ainda não commitadas; preservar relatórios e arquivos atuais. Não há migração parcialmente aplicada.
- Retomar serviços com `./scripts/homolog.ps1 -Action up`; consultar com `-Action status`; parar preservando dados com `-Action stop`.

### Retomada da etapa 1B (histórico)

- Achado R15 corrigido; R11 corrigido somente na parte de navegador. Cache por sessão, cancelamento de requisições antigas, descarte de respostas atrasadas, sincronização entre abas, 401 e expiração implementados. Falha de conexão preserva acesso salvo e oferece recuperação.
- `npm test --prefix apps/web`: 15 testes passaram, incluindo StrictMode, troca de usuário, cache/formulário, respostas atrasadas, rede e temporizadores.
- Build TypeScript/Vite e Docker concluídos. Nginx aprovado. Interface validada com dois dentistas fictícios, duas abas, próxima consulta por usuário, API parada/religada e 401 real.
- Fixtures temporárias da etapa 1B removidas pela API. Dados da etapa 0 e volumes preservados. API religada e web atualizada; ambiente `erp-dents-homolog` ativo.
- Implementação em `session.ts`, `api.ts`, `query-client.ts`, `use-auth.tsx`, composição de `App.tsx` e chaves de Consulta. Testes em `apps/web/tests/session.test.tsx`. Dependências de teste adicionadas; lockfile/versões gerais ficam na 1D.
- Nenhuma migração de banco nesta etapa. Mudanças desta entrega e anteriores ainda não commitadas; não descartar arquivos existentes.
- **Próximo recorte: 1C.1 — limites administrativos e último administrador.** Ler R08/R09 e os casos de uso de usuários/permissões, confirmar a numeração dos achados na revisão e preparar cenários para usuários com permissões delegadas e tentativas de remover/rebaixar/inativar o último admin. Depois, em entregas separadas da mesma etapa, bootstrap exclusivo e revogação/autenticação.
- Política de acesso à lista geral de pacientes permanece pendente (R13/etapa 3). Tokens continuam em localStorage e ainda não são revogados pelo logout no servidor (1C/1D).

### Retomada da etapa 1C.1 (histórico)

- Gestão de usuários recebe o ator autenticado; casos de uso relêem identidade/permissões sob bloqueio transacional. Não administradores não criam/promovem/alteram/excluem/redefinem senha de administradores.
- PostgreSQL serializa gravações administrativas; último administrador ativo preservado em exclusão, inativação e rebaixamento, inclusive simultâneos. Sem migração de banco.
- Interface oculta ações/opção de administrador para delegados e informa a necessidade de manter um admin ativo. Alterar o próprio perfil/status ou excluir a própria conta encerra a sessão local.
- Validação: 16 testes PostgreSQL, 15 frontend, 7 grupos HTTP administrativos e 10 grupos de fluxo geral passaram. Concorrência observada em `pg_locks`; três cenários preservaram um admin ativo.
- Interface conferida no Chrome. Fixtures desta etapa removidas e permissões originais de coordenador restauradas. Nenhum schema de teste restante. Containers de homologação ativos e atualizados; dados da etapa 0 preservados.
- Evidências/comandos: `docs/homologacao-etapa-1C1.md`. Testes PostgreSQL em `apps/api/tests/test_user_administration.py`; HTTP em `scripts/smoke_admin_homolog.py`.
- Regra permanente de commit/push registrada em AGENTS.md. Consultar `git log -1` e `git status` ao retomar; nunca publicar `.env.homolog`, `.data` ou volumes. Git sincroniza código/documentação, não os dados locais do Docker.
- **Próximo recorte: 1C.2 — bootstrap exclusivo e ativação inicial controlada (R10).** Mapear bootstrap, segredo de instalação e experiência de primeira execução; testar disputa entre requisições em banco isolado e inicialização com banco existente. Revogação de sessões/senhas fica em recorte posterior de 1C.

### Retomada da etapa 1C.2 (histórico)

- Código local de ativação, registro persistente da instalação e criação transacional exclusiva implementados. R10 corrigido; exclusão de usuários não reabre bootstrap.
- Migração `0008_installation_state` aplicada após testes isolados e cópia local do banco em `.data/homolog/pre-1C2.dump`. Dados e volumes anteriores preservados. Cópia não inclui exames nem valida restauração completa.
- Passaram 26 testes PostgreSQL, 21 frontend, 7 grupos HTTP de bootstrap, 10 grupos do fluxo geral e testes PowerShell do gerador. Build Docker concluído; login/painel existentes conferidos no Chrome.
- Evidências e comandos em `docs/homologacao-etapa-1C2.md`; instruções de ativação no README. Código de homologação em variável local ignorada; nunca publicar seu valor.
- **Próximo recorte: 1C.3 — revogação de sessões no servidor (R11).** Mapear JWT, logout, troca/reset de senha e inativação; definir invalidação persistente e testar tokens antigos, sessões simultâneas e reinício. Senhas/tentativas e dependências mantêm recortes próprios.
- Ao retomar, conferir `git status` e `git log -1`. Commit/push desta entrega são obrigatórios; o histórico Git identifica a versão publicada. Não reiniciar a revisão nem repetir testes aprovados sem mudança relevante.

### Retomada da etapa 1C.3 (histórico)

- Sessões persistentes em `auth_sessions`; JWT exige identificador associado ao usuário e sessão válida. Logout idempotente individual; senha/status/perfil/e-mail/dentista revogam sessões na mesma transação. Reinício e reativação não recuperam tokens revogados.
- Migração `0009_auth_sessions` aplicada na homologação após testes isolados e cópia de banco `.data/homolog/pre-1C3.dump`. Tokens anteriores exigem novo login; usuários/dados/volumes preservados. A cópia não inclui exames nem valida restauração completa.
- Passaram 38 testes distintos PostgreSQL (26 anteriores + 12 de sessões), 25 frontend, 12 grupos HTTP de ativação/sessões e 10 do fluxo geral. Login/logout conferidos no Chrome; logout removeu a sessão no banco. Nenhum schema de teste restante.
- Recuperação local de senha agora importa corretamente o aplicativo e revoga sessões. Senha atual incorreta no formulário retorna 400 e preserva acesso. Falha de rede no logout esconde os dados e permite tentar novamente sem confirmar saída indevidamente.
- Evidências e comandos em `docs/homologacao-etapa-1C3.md`. Testes novos em `apps/api/tests/test_auth_sessions.py` e `scripts/smoke_sessions_homolog.py`. Git sincroniza somente código/testes/documentação, não credenciais ou dados Docker.
- **Próximo recorte: 1C.4 — política de senhas, tentativas e configuração de autenticação (R12).** Mapear limites em bytes do bcrypt, mensagens uniformes e limitação por conta/origem; preservar hashes/credenciais existentes. Rever senha na linha de comando de recuperação. Revisão do armazenamento do token permanece explícita; não considerar resolvida por revogação.
- Consultar `git log -1` e `git status` ao retomar. Commit/push ao concluir esta entrega; sem force push. Não repetir a revisão geral nem testes aprovados sem mudança relevante.

### Retomada da etapa 1C.4 (histórico)

- Novas senhas usam bcrypt-SHA256, 8 a 128 caracteres Unicode, política central aplicada em todos os caminhos. Hashes bcrypt antigos são aceitos sem regravação; limitações acima de 72 bytes permanecem até troca explícita. Exportação duplicada de segurança substituída por uma única implementação.
- Login com resposta uniforme para conta inexistente/inativa/senha incorreta. Contadores HMAC em `auth_attempts`, serializados no PostgreSQL; 10 logins/conta, 120/origem, 10 ativações/origem e 5 trocas de senha/usuário por 60 segundos. 429 com Retry-After; cabeçalhos de proxy não são confiados pelos comandos Docker.
- JWT vazio/curto/exemplo é rejeitado; gerador local aceita `JWT_SECRET_KEY` sem imprimir o valor. Recuperação local usa prompt oculto ou entrada padrão, rejeita senha em argumentos sem eco e não aceita fallback visível. Revogação de sessões preservada.
- Migração `0010_auth_attempts` aplicada após testes isolados e cópia `.data/homolog/pre-1C4.dump`, somente banco. Dados, credenciais e volumes preservados; fluxo geral confirmou login anterior. Banco em head, web/API de homologação ativas.
- Passaram 49 testes distintos de backend (38 anteriores + 11 novos), 28 frontend, 13 grupos HTTP de proteção de autenticação, 12 de sessões e 10 do fluxo geral. Testes PowerShell e build Docker aprovados. Não houve inspeção visual nova; interface validada por componentes/build.
- Evidências, comandos e limites em `docs/homologacao-etapa-1C4.md`. Não há bloqueio progressivo/permanente; janelas fixas precisam de avaliação sob carga. NAT/proxy pode agregar origens. Recuperação ainda não tem trilha de auditoria; permanece no escopo de auditoria geral.
- **Próximo recorte: 1D.1 — segurança e ciclo de vida dos exames.** Ler os achados sobre upload, tipo/tamanho, visualização/download, autorização e arquivos órfãos. Preparar cenários com arquivos fictícios em ambiente isolado. Dependências gerais e armazenamento de token ficam em recortes próprios de segurança; HTTPS/instalador na etapa 5.
- Conferir `git log -1` e `git status` ao retomar. Entrega exige commit/push e igualdade local/remoto. Não publicar `.env`, `.data`, backups ou volumes. Não repetir revisão geral nem verificações aprovadas sem mudança relevante.


### Retomada da entrega inicial 1D.1 (histórico)

- Implementação e testes em 16/09/2026; fechamento documental em 17/09/2026. Base publicada `94a7347` (1C.4).
- Uploads PDF/JPG/PNG com limite padrão de 20 MiB configurável por `EXAM_MAX_BYTES`; política consultada pela interface. Sem resposta à preferência de formatos adicionais; padrão comunicado e adotado, arquivos antigos preservados.
- Limite do corpo antes do multipart, streaming, validação de marcadores/extensão, download attachment e prévia somente de imagens. Progresso/cancelamento e erros tratados na interface.
- Migração `0011_exam_file_deletions` persiste intenção de limpeza após commit; falhas são retomáveis na inicialização, exclusões e CLI. Compensação preserva arquivo quando o resultado do commit é incerto. Paciente com consulta retorna 409.
- Passaram 64 testes distintos de backend, 34 frontend, 12 grupos HTTP isolados e 10 gerais. Build Docker aprovado; política e modal de imagem conferidos no Chrome. Banco em head; zero schemas de teste e zero itens pendentes de limpeza na conferência final.
- Cópia prévia `.data/homolog/pre-1D1.dump` somente do banco; dados/volumes preservados. Não comprova restauração dos exames. Credenciais/backups/dados locais continuam fora do Git.
- Limitações: assinatura não é parser/antivírus; órfãos após crash exigem reconciliação futura; quota, proxy, carga, auditoria e retenção pendentes. R29/R31/R33 parcialmente tratados; R30 tratado no fluxo da aplicação. Detalhes em `docs/homologacao-etapa-1D1.md`.
- **Próximo recorte: 1D.2 — dependências e builds reproduzíveis.** Inspecionar manifests/lockfiles, confrontar versões e vulnerabilidades com fontes oficiais, atualizar de forma compatível e validar regressões. Armazenamento do token permanece pendente explícito; HTTPS/instalação assistida na etapa 5.
- Ao retomar, conferir `git status`, `git log -1` e remoto. Commit/push ao concluir, sem force push; não repetir verificações já aprovadas sem mudança relevante.

### Retomada do complemento 1D.1 (histórico)

- Solicitação do usuário: resolver as pendências de exames antes de avançar. Base `2ed2c84`. Reconciliação, quota, manutenção periódica, concorrência/tempo/proxy e antivírus implementados; não iniciar novamente esses trabalhos.
- Órfãos sem referência e com pelo menos 24 horas são movidos para quarentena recuperável, sem descarte automático. CLI restaura bytes sem sobrepor arquivos; referências ausentes geram contagens de alerta. Uploads, exclusões e manutenção compartilham bloqueio PostgreSQL entre processos. Quota padrão de 50 GiB inclui quarentena e resíduos físicos.
- ClamAV local obrigatório em uploads e downloads legados; detecção bloqueia e indisponibilidade/assinaturas acima de sete dias falham de forma fechada. FreshClam atualizado e verificado; serviço sem porta publicada e com limite de 4 GiB de RAM.
- Três Compose incluem gateway com limite alinhado ao arquivo, duas vagas de envio, timeout e DNS dinâmico da API. A URL externa continua a mesma; API deixa de publicar porta diretamente. Middleware mantém limites próprios mesmo em acesso interno. O orçamento de autenticação por origem é compartilhado pelo gateway; limite por conta permanece.
- Passaram 78 testes de backend na suíte completa, 14 novamente após ajustes finais, HTTP de exames/antivírus indisponível/quota concorrente/exclusão bloqueada e manutenção periódica real. Gateway passou 413/503/408 e 80 chamadas de saúde com oito clientes, p95 de 0,093 s. Fluxo geral: dez grupos aprovados. Sem alterações de frontend ou nova inspeção visual.
- Banco permanece em `0011_exam_file_deletions`. Cópias locais prévias de banco e exames em `.data/homolog/pre-1D1-complement.*`; não publicadas. Não equivalem a ensaio completo de restauração. Volumes/dados anteriores preservados.
- Roteiro, comandos e limites em `docs/operacao-exames.md`. Não executar o ensaio de saturação do gateway em paralelo com uploads de outro smoke; APIs descartáveis usam a mesma porta 18001.
- Retenção clínica, auditoria de prontuário, autorização por paciente, HTTPS e recuperação assistida permanecem nas etapas próprias. Antivírus não garante detectar toda ameaça nem validar semanticamente documentos. Este fechamento trata as pendências técnicas de arquivos, não a liberação global para produção.
- **Próximo recorte previsto: 1D.2 — dependências e builds reproduzíveis**, ainda não iniciado. Conferir `git status`, `git log -1` e remoto ao retomar. Commit/push obrigatório nesta entrega; não publicar arquivos locais, credenciais ou backups.

### Ponto de retomada atual — 1D.2, 17/09/2026

- Dependências Python/npm fixadas com locks completos; bases Docker fixadas por digest. PyJWT substitui JOSE/ecdsa, mantendo HS256, senhas e sessões. Node 24, Router 7, Vite 7 e Vitest 4 homologados. Não repetir a revisão inicial de dependências.
- API Alpine sem compilador/pip, UID 10001. Novo serviço one-shot `exam-storage-init` ajusta permissões do volume dedicado sem alterar bytes/seguir links. Saída 0 é estado normal, não falha de serviço.
- PostgreSQL 16.15 em imagem derivada com pacotes corrigidos; `su-exec` substitui o gosu com runtime Go antigo no ponto de troca de usuário do entrypoint. Criação em banco vazio e atualização 16.13 → 16.15 verificadas, sem mudança de major ou migração de esquema.
- Passaram 81 testes backend, 34 frontend, builds prod/dev, dez grupos HTTP gerais, sessões (12), autenticação (13), exames (12), operações (12) e antivírus indisponível (9). Smoke de permissões testou volume realmente descartável. Navegador: login/painel/pacientes/exames/prévia/rota recarregada/calendário/financeiro/logout conferidos.
- Auditorias locais com zero avisos conhecidos em npm/Python e zero achados nas cinco imagens de execução. Relatórios em `.data/security`. Não há exceções de CVE; auditoria semanal prevista. Avisos futuros exigem nova avaliação.
- Atualização principal realizada após cópias `.data/homolog/pre-1D2.dump` e `pre-1D2-exams.tar`; fingerprints de tabelas de negócio e SHA-256 dos arquivos coincidiram antes/depois. JWT da versão anterior funcionou e foi revogado. Dados/volumes/segredos preservados, banco em `0011_exam_file_deletions`, serviços ativos.
- Novo workflow `.github/workflows/verify.yml` inclui dependências, frontend, backend PostgreSQL, smokes HTTP/ClamAV e imagens. Jenkins permanece exemplo complementar, com locks e testes, sem se passar por suíte integrada.
- **Publicação e validação remota:** implementação `a3b281e` enviada ao `origin/main`; [GitHub Actions 35260375483](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35260375483) aprovado em 6min42s, incluindo Docker limpo, 81 testes backend, 34 frontend, smokes e auditorias. Fechamento posterior somente documental. Ao retomar, consultar `git log -1`, `git status` e remoto; não publicar `.data`, `.env`, credenciais, dumps ou volumes.
- **Próximo recorte após fechar 1D.2:** 1D.3 — tratamento de erros e fechamento de segurança, incluindo mensagens internas, exceções duplicadas e decisão sobre token no navegador. Não iniciar concorrência de agenda/cobrança antes desse fechamento; HTTPS/instalador/backup assistido seguem na etapa 5.
