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
| 1D | Exames, erros e dependências de segurança | Concluída: 1D.1, 1D.2, 1D.3.1 e 1D.3.2 | Limites/tipos, ciclo de vida, dependências, erros, sessão por cookie/CSRF e transporte HTTPS homologados; instalação assistida permanece na etapa 5 |
| 2A | Concorrência de agenda e cobrança | Concluída: 2A.1 e 2A.2 | PostgreSQL rejeita conflitos simultâneos; geração idempotente |
| 2B | Edição concorrente e histórico financeiro | Em andamento: 2B.1 e 2B.2 concluídas; demais recortes pendentes | Alterações não se perdem; baixa idempotente; pagamentos/estornos rastreáveis |
| 3 | Datas, cadastros, permissões, paginação, atualização entre PCs e interação | Pendente | Cenários por perfil e dados representativos aprovados |
| 4 | Atendimento/prontuário e estrutura de cobrança/pagamentos | Pendente | Escopo validado com a clínica; histórico e autoria preservados |
| 5 | Instalação assistida, HTTPS, backup, atualização e recuperação | Pendente | Instalar, reiniciar, atualizar e restaurar em ambiente isolado com roteiro simples |
| 6 | Homologação final, carga, usabilidade e piloto | Pendente | Critérios da revisão atendidos e limitações aceitas explicitamente |

Etapa 1A é pequena e pode ser concluída junto com a preparação da etapa 0. Funcionalidades de prontuário, parcelamento e instalação final terão decisões próprias antes da implementação.

## Entrega atual

**Em andamento: 2B.3 — edição concorrente de dentistas**, base `1e9415e`. Proteger dados, especialidade textual e disponibilidade no mesmo registro com versão obrigatória e gravação atômica; preservar rascunho e oferecer recarga explícita. Última entrega concluída: [2B.2](./homologacao-etapa-2B2.md). Procedimentos/especialidades, exclusões, regras entre disponibilidade e consultas e histórico financeiro permanecem em recortes próprios.

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

### Retomada da 1D.2 — 17/09/2026 (histórico)

- Dependências Python/npm fixadas com locks completos; bases Docker fixadas por digest. PyJWT substitui JOSE/ecdsa, mantendo HS256, senhas e sessões. Node 24, Router 7, Vite 7 e Vitest 4 homologados. Não repetir a revisão inicial de dependências.
- API Alpine sem compilador/pip, UID 10001. Novo serviço one-shot `exam-storage-init` ajusta permissões do volume dedicado sem alterar bytes/seguir links. Saída 0 é estado normal, não falha de serviço.
- PostgreSQL 16.15 em imagem derivada com pacotes corrigidos; `su-exec` substitui o gosu com runtime Go antigo no ponto de troca de usuário do entrypoint. Criação em banco vazio e atualização 16.13 → 16.15 verificadas, sem mudança de major ou migração de esquema.
- Passaram 81 testes backend, 34 frontend, builds prod/dev, dez grupos HTTP gerais, sessões (12), autenticação (13), exames (12), operações (12) e antivírus indisponível (9). Smoke de permissões testou volume realmente descartável. Navegador: login/painel/pacientes/exames/prévia/rota recarregada/calendário/financeiro/logout conferidos.
- Auditorias locais com zero avisos conhecidos em npm/Python e zero achados nas cinco imagens de execução. Relatórios em `.data/security`. Não há exceções de CVE; auditoria semanal prevista. Avisos futuros exigem nova avaliação.
- Atualização principal realizada após cópias `.data/homolog/pre-1D2.dump` e `pre-1D2-exams.tar`; fingerprints de tabelas de negócio e SHA-256 dos arquivos coincidiram antes/depois. JWT da versão anterior funcionou e foi revogado. Dados/volumes/segredos preservados, banco em `0011_exam_file_deletions`, serviços ativos.
- Novo workflow `.github/workflows/verify.yml` inclui dependências, frontend, backend PostgreSQL, smokes HTTP/ClamAV e imagens. Jenkins permanece exemplo complementar, com locks e testes, sem se passar por suíte integrada.
- **Publicação e validação remota:** implementação `a3b281e` enviada ao `origin/main`; [GitHub Actions 35260375483](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35260375483) aprovado em 6min42s, incluindo Docker limpo, 81 testes backend, 34 frontend, smokes e auditorias. Fechamento posterior somente documental. Ao retomar, consultar `git log -1`, `git status` e remoto; não publicar `.data`, `.env`, credenciais, dumps ou volumes.
- **Próximo recorte após fechar 1D.2:** 1D.3 — tratamento de erros e fechamento de segurança, incluindo mensagens internas, exceções duplicadas e decisão sobre token no navegador. Não iniciar concorrência de agenda/cobrança antes desse fechamento; HTTPS/instalador/backup assistido seguem na etapa 5.

### Retomada da 1D.3.1 — concluída em 17/09/2026 (histórico)

- Escopo comunicado: erros e recuperação nesta entrega; sessão/cookie/CSRF em recorte separado 1D.3.2. Não declarar removido o token de localStorage.
- Implementados middleware de falhas com mensagens seguras, referência gerada no servidor e no-store; validação sem input/ctx; rollback explícito da dependência de banco; reexports canônicos das exceções/handlers. PostgreSQL com logs sem statement/parâmetros/detalhes de linhas.
- Interface interpreta 422, oculta mensagens técnicas 5xx, mostra falha/carregamento da agenda com recuperação e mantém cadastros do formulário durante falha. Temporizador de toast corrigido. UTF-8 de descrição da API e notificação de permissões corrigido.
- Corrigido erro adicional na exclusão de procedimento referenciado: `passive_deletes="all"` deixa a FK impedir a operação, preservando vínculos e retornando 409. Sem migração de banco.
- Passaram 87 testes backend distintos (86 na suíte + um novo caso de streaming no grupo focado), 38 frontend, dez grupos HTTP de erros e dez gerais. Builds aprovados. Chrome confirmou falha real de agenda com API parada, recuperação sem novo login e formulário preservado ao recarregar cadastros. API religada e homologação atualizada.
- Cópias locais `pre-1D3-1.dump`/`pre-1D3-1-exams.tar`; registros/bytes preservados, banco em `0011_exam_file_deletions`. Sessão de teste expirou durante pausa do usuário; login com credenciais existentes aprovado, sem reset. Não publicar dados/segredos.
- Testes novos: `test_error_handling.py`, `errors.test.tsx`, `smoke_errors_homolog.py`; workflow inclui o smoke de erros. Implementação `131ed9a` publicada; [CI 35298005705](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35298005705) aprovado em 6min53s com os 87 testes backend juntos, 38 frontend, smokes/builds/auditorias. Cinco imagens sem achados na consulta. Commit posterior apenas documental. Conferir árvore e remoto ao retomar; não repetir esta etapa sem novo motivo.
- Próxima entrega: **1D.3.2 — sessão por cookie protegido, CSRF e transporte**. Token continua em localStorage e risco está explícito no relatório. Não considerar toda a 1D.3 concluída. Revisão dos demais estados de tela/modais permanece na etapa 3; R37 está parcialmente tratado.

### Preparação da 1D.3.2 em 17/09/2026 (histórico)

- Usuário autorizou iniciar a próxima fase, informando 19% de uso restante. Recorte limitado a mapeamento e plano de implementação para deixar uma entrega completa e retomável; nenhuma mudança parcial no login.
- Documento: [plano da 1D.3.2](./plano-etapa-1D3-2.md). Contém arquivos, contratos atuais, proposta de cookie/CSRF, riscos de concorrência entre abas, transição e matriz de aceite.
- Dependência identificada: web/API atualmente em origens distintas e sem TLS configurado. Preparar endereço HTTPS único e proxy `/api` sem contornar o gateway de uploads. Automação da instalação nos computadores permanece na etapa 5.
- Próximo trabalho: **1D.3.2a**, somente transporte/configuração e homologação isolada, mantendo autenticação atual funcional. Cookie/CSRF e frontend têm recortes posteriores coordenados; não iniciar todos de uma vez.
- Token continua em localStorage; nenhuma alteração em código executável, serviços, banco ou volumes nesta entrega. Suítes/builds não repetidos; validação documental por revisão do diff e `git diff --check`. Última homologação de execução continua sendo a 1D.3.1.
- Publicar estes dois documentos com commit/push; conferir `git status`, `git log -1` e igualdade HEAD/remoto ao retomar. Não repetir revisão geral nem publicar `.env`, `.data`, credenciais ou backups.

### Implementação da 1D.3.2 em 18/09/2026 (histórico)

- Usuário ampliou a autorização para executar a fase inteira. Cookie/CSRF, metadados de sessão, coordenação entre abas e HTTPS implementados; homologação atualizada em `https://localhost:18443`. Dados de negócio e arquivos preservados, sem migração de esquema.
- Não há JWT no login/localStorage; apenas marcador não autenticante. API rejeita bearer e JWT legado como cookie. Sessões anteriores exigem novo login; senhas existentes mantidas. Logout revoga sem apagar cookie para evitar corrida com respostas antigas.
- Passaram 97 testes backend, 42 frontend, smokes de sessões/erros/tentativas/fluxo geral/exames/operações/antivírus e TLS/cookies. Limites 413/503/408 confirmados através do HTTPS. Inicialização sem metadados/conexão não oferece saída que não possa confirmar. [Relatório](./homologacao-etapa-1D3-2.md) e [operação HTTPS](./sessao-e-https.md).
- Pendência local: Windows pede confirmação da CA `ERP Dents Homolog Local CA`, em `certutil -user -addstore Root .data/tls/homolog/ca.crt`; usuário já foi solicitado. Não automatizar aprovação de permissão de segurança nem ignorar certificado. Após confiar, rodar `scripts/smoke_browser_homolog.cjs` com Playwright e Chrome. O teste HTTP HTTPS já validou a cadeia com CA explícita.
- Publicar implementação e acompanhar CI; depois registrar resultado e fechar documentação. Não repetir a revisão ou a suíte inteira sem mudança/falha que justifique. Próxima fase de negócio só após fechar esta validação.
- Cópias locais `.data/homolog/pre-1D3-2.dump`, `pre-1D3-2-exams.tar` e fingerprints; certificados em `.data/tls`. Nada disso vai ao Git. Outra máquina precisa preparar seus próprios dados/segredos/certificados.

### Retomada da 1D.3.2 — concluída em 18/09/2026 (histórico)

- Implementação `2ac8d60` publicada no `origin/main`. [CI 35339487918](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35339487918) aprovado em 7min45s: 97 testes backend, 42 frontend, HTTP, TLS/cookies, gateway, builds e auditorias. Cinco imagens sem achados conhecidos na consulta.
- Confiança no certificado local resolvida; Chrome abriu HTTPS sem bypass. Smoke de navegador aprovado: login, painel/pacientes carregados, duas abas/reload, cookie HttpOnly/Secure e invisível ao JavaScript, nenhuma credencial no localStorage, falha de saída/retry e revogação. Capturas locais conferidas. Pendência de confirmação mencionada no histórico acima não está mais ativa.
- Homologação ativa em **https://localhost:18443**. Banco em `0011_exam_file_deletions`; zero schemas de teste; dados/arquivos idênticos à cópia anterior. Inicializador de permissões com saída 0 é esperado. Nenhuma migração nova ou remoção de volume.
- Etapa 1D encerrada no escopo previsto. Roteiro de HTTPS/configuração: `docs/sessao-e-https.md`. A instalação assistida, distribuição/renovação do certificado nos computadores da clínica e recuperação completa continuam na etapa 5; revisões de interação/telas na etapa 3. Produção real não foi implantada.
- **Próximo recorte: 2A.1 — concorrência de agenda.** Mapear criação/edição/cancelamento e verificar duas reservas simultâneas do mesmo dentista/intervalo em PostgreSQL isolado. Definir proteção transacional e cenários de alteração concorrente antes de mudar o banco. Cobrança idempotente vem em recorte separado de 2A. Não repetir a revisão geral.
- Fechamento posterior ao CI altera somente documentação e espera de carregamento no smoke manual, executado novamente com sucesso. Ao retomar, conferir `git status`, `git log -1` e remoto. Commit/push obrigatório; não publicar dados, credenciais, backups ou certificados locais.

### Retomada da 2A.1 — concluída em 18/09/2026 (histórico)

- Base `968acd3`. R16 reproduzido em PostgreSQL: duas reservas aceitas quando ambas passam a consulta anterior ao commit. Migração `0012_appointment_exclusion` implementa exclusão GiST por dentista/paciente (exceto cancelados), intervalo `[início, fim)` e fim maior que início. SQLSTATE `23P01` traduzido para 409 seguro.
- Migração interrompe sem alterar consultas se encontrar dados antigos inválidos/sobrepostos. Extensão `btree_gist` em `public`; não é removida pelo downgrade. Janela de atualização necessária pelo bloqueio da tabela durante preflight/DDL.
- Passaram 11 testes focados com barreiras/conexões separadas, 12 grupos HTTP e 10 do fluxo geral. Chrome confirmou 409 real com rascunho/datas preservados; fixtures removidas. Suíte backend completa aprovada: 108 testes. Implementação `db08833` publicada; [CI 35371561463](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35371561463) aprovado em 8min25s com 108 testes backend, 42 frontend, smokes, builds e auditorias.
- Homologação principal já em `0012_appointment_exclusion`, três restrições conferidas. Cópias locais `pre-2A1.dump`, `pre-2A1-exams.tar` e fingerprints; dados/arquivos anteriores idênticos após migração e smokes. Nunca publicar essas cópias.
- Evidências: `docs/homologacao-etapa-2A1.md`. Testes: `test_appointment_concurrency.py`, `smoke_agenda_homolog.py` e smoke manual de navegador. Sem alteração de frontend. Rolagem horizontal da lista permanece na etapa 3; perda de campos em duas edições da mesma consulta, na 2B.
- Homologação ativa em **https://localhost:18443**, sem schemas descartáveis restantes. Fechamento posterior ao CI somente documental; conferir árvore limpa e HEAD remoto ao retomar. Próxima subetapa será **2A.2 — geração idempotente de cobrança**: reproduzir solicitações simultâneas/repetidas e definir garantia transacional antes de alterar a geração. Não repetir a revisão geral nem considerar toda a 2A concluída.

### Retomada da 2A.2 — concluída em 18/09/2026 (histórico)

- Base `b1e36c7`. R17 reproduzido e corrigido: migração `0013_financial_generation` instala índice único parcial de cobrança ativa por consulta e tabela persistente de repetição. Preflight recusa duplicações antigas sem alterar cobranças; exige janela pelo bloqueio da tabela.
- Geração aceita UUID opcional `idempotency_key`; mesma chave/parâmetros recupera o mesmo lançamento no estado atual, parâmetros diferentes geram 409. Chave e cobrança na mesma transação. Cancelamento libera nova operação, mas repetição antiga continua ligada ao cancelado; exclusão deixa registro sem referência que impede recriação tardia. Clientes sem chave mantêm conflito sequencial.
- Frontend mantém chave na memória após falha com os mesmos dados; troca ao mudar parâmetros ou após sucesso. Recarregar perde a chave local, mas unicidade continua impedindo duplicação. Sem parcelamento, versionamento ou histórico financeiro completo nesta entrega.
- Passaram 11 testes focados, 119 na suíte backend completa, 42 frontend, builds API/web, 11 grupos HTTP financeiros e 10 gerais. Chrome confirmou perda de resposta após commit e recuperação do mesmo ID com exatamente uma cobrança; captura conferida. Node do teste requer `NODE_EXTRA_CA_CERTS` com a CA local; não há aprovação de certificado pendente.
- Homologação principal atualizada, dados anteriores/exames preservados por fingerprints; cópias locais `pre-2A2.dump`, `pre-2A2-exams.tar` e estado. Registros novos de repetição dos testes ficam sem referência após limpeza das fixtures. Não publicar `.data`, segredos ou certificados.
- Implementação `d5d2484` publicada; [CI 35404599297](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35404599297) aprovado em 7min44s com 119 testes backend, 42 frontend, smokes, builds e auditorias. Zero schemas de teste restantes. Homologação ativa em **https://localhost:18443**. Fechamento posterior somente documental.
- Evidências/contrato/comandos: `docs/homologacao-etapa-2A2.md`. Conferir árvore limpa e HEAD local/remoto ao retomar. Próxima etapa: **2B — edição concorrente e histórico financeiro**, a dividir em recortes pequenos antes de implementar. Começar pelo mapeamento dos formulários e operações com risco de sobrescrita (R18), definindo controle de versão e resposta a conflito; baixa/histórico vêm em recorte próprio (R26). Não repetir a revisão geral nem declarar produção real liberada.

### Retomada da 2B.1 — concluída em 19/09/2026 (histórico)

- Usuário autorizou iniciar a próxima etapa com 40% de contexto restante. Recorte definido e comunicado: **edição de pacientes**, base `60347c6`; não implementar toda a 2B de uma vez.
- Migração `0014_patient_version`, versão positiva inicialmente 1; PUT de pacientes exige versão. Comparação/incremento atômicos em SQL. Versão antiga retorna 409, inexistência 404, precondição ausente/inválida 422. Campos existentes preservados; frontend/API precisam ser atualizados juntos.
- Formulário mantém versão original e rascunho em conflito; opção explícita **Descartar rascunho e carregar atual** só substitui após leitura bem-sucedida. Falha de recarga conserva rascunho. Não há reenvio ou mesclagem automática.
- Passaram oito testes PostgreSQL focados, dez grupos HTTP específicos e dez gerais, 43 testes frontend, builds API/web. Chrome com duas abas aprovou conflito real, rascunho preservado, recarga e salvamento revisado. Suíte backend completa aprovada: 127 testes. Retomada em 19/09/2026 para publicação e acompanhamento do CI.
- Homologação principal em `0014_patient_version`; cópias locais `pre-2B1.dump`, `pre-2B1-exams.tar` e fingerprints. Campos anteriores/bytes dos exames preservados, fixtures de navegador removidas. Não publicar `.data`, credenciais ou certificados.
- Evidências e contrato: `docs/homologacao-etapa-2B1.md`. R18 parcialmente tratado só para edição de pacientes; exclusões, demais cadastros e financeiro permanecem pendentes. Próximo recorte proposto: **2B.2 — edição concorrente da agenda**. Histórico financeiro terá recorte próprio. Fechar testes/CI, commit/push e verificar HEAD remoto; não repetir a revisão geral.
- Retomada em 19/09: implementação `1236a59` publicada. CI `35441069660` passou os 127 testes e falhou no teste de timeout do gateway, que não registrava o status observado. Leitura de resposta reforçada com `HTTPResponse` em vez de um único `recv`; exigência de 408 mantida. Ensaio local passou 413/503/408 e 80 chamadas de saúde. Publicar ajuste do teste e aguardar novo CI; não declarar etapa concluída antes disso.
- **Fechamento:** ajuste `0142dfe` publicado e [CI 35441701732](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35441701732) aprovado em 9min14s, com 127 testes backend, 43 frontend, HTTP, builds e auditorias. Gateway passou 413/503/408 e 80 chamadas de saúde; pendência anterior encerrada. Zero schemas descartáveis. Homologação ativa em **https://localhost:18443**, migração `0014_patient_version`.
- Ao retomar: conferir árvore limpa e igualdade HEAD/remoto. Fechamento posterior ao CI somente documental. Iniciar **2B.2 — edição concorrente da agenda** mapeando edição na lista/calendário e tratamento do rascunho, preservando as restrições de sobreposição da 2A.1. Não repetir pacientes nem avançar para histórico financeiro sem recorte próprio. API/frontend atualizados juntos; abas antigas precisam recarregar para enviar versão de pacientes.

### Retomada da 2B.2 — concluída em 19/09/2026 (histórico)

- Base `aa316c9`, usuário autorizou iniciar a próxima etapa com 59% de contexto. Recorte: edição de consultas na lista e calendário, sem ampliar para histórico financeiro ou exclusões.
- Migração `0015_appointment_version`; versão positiva inicialmente 1. PUT exige versão; aplicação compara antes das validações e banco compara/incrementa atomicamente. Campos e procedimentos na mesma transação. Sobreposição/FK rejeitada não consome versão nem deixa vínculos parciais.
- Dois formulários guardam versão de origem e preservam rascunho/datas/procedimentos no conflito; recarga explícita só substitui após leitura bem-sucedida. Mantém duração gravada, sem aplicar sugestão automaticamente. Sem reenvio/mesclagem automática.
- Passaram dez testes PostgreSQL focados, 45 frontend, dez grupos HTTP específicos, 12 de sobreposição e dez gerais; builds API/web. Chrome real passou nos dois sentidos (lista altera/calendário conflita e calendário altera/lista conflita), seleção de procedimento preservada, recarga e revisões até versão 5. Capturas conferidas; fixtures removidas. Suíte backend completa aprovada: 137 testes.
- Homologação principal atualizada em `0015_appointment_version`; cópias locais `pre-2B2.dump`, `pre-2B2-exams.tar` e fingerprints. Campos anteriores/vínculos/exames preservados após migração e smokes. Não publicar `.data`, segredos ou certificados.
- Implementação `4a434d5` publicada. [CI 35460555407](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35460555407) aprovado em 8min56s com 137 testes backend, 45 frontend, HTTP, builds e auditorias. Gateway passou 413/503/408 e 80 chamadas de saúde. Zero schemas descartáveis. Homologação ativa em **https://localhost:18443**, migração `0015_appointment_version`. Fechamento posterior somente documental.
- Contrato/comandos/evidências: `docs/homologacao-etapa-2B2.md`. Próximo recorte: **2B.3 — demais cadastros, começando por dentistas**; mapear dados, especialidades e disponibilidade antes de implementar versão/transação/recarga no formulário. R18 ainda parcial; exclusões, disponibilidade concorrente entre recursos e financeiro requerem recortes próprios. Ao retomar, conferir árvore limpa e igualdade HEAD/remoto. API/frontend juntos e abas antigas recarregadas; não repetir agenda nem revisão geral.

### Ponto de retomada atual — 2B.3 em andamento em 19/09/2026

- Base `1e9415e`; recorte: edição de dentistas, incluindo especialidade textual e lista de disponibilidade no mesmo registro. Catálogo de especialidades/procedimentos, exclusões e regras entre disponibilidade e consultas já marcadas não fazem parte desta entrega.
- Migração `0016_dentist_version`, precondição obrigatória no PUT e comparação/incremento atômicos implementados. Interface preserva rascunho em 409 e oferece recarga explícita. Dez testes PostgreSQL focados, 46 testes frontend distintos, dez grupos HTTP específicos e dez gerais aprovados; imagens API/web construídas. Chrome com duas abas confirmou conflito, especialidade/horários preservados, recarga explícita e salvamento revisado. Capturas conferidas; fixtures removidas.
- Homologação principal atualizada em `0016_dentist_version`; fingerprints após atualização/smokes confirmam campos anteriores e bytes dos exames preservados. Cópias prévias em `.data/homolog/pre-2B3*`; não publicar. Falta concluir suíte backend completa e publicar/acompanhar CI. Contrato e comandos em `docs/homologacao-etapa-2B3.md`.
- Usuário mencionou TXT de acessos; nome/caminho solicitado porque não foi encontrado. Não publicar credenciais; conferir exclusão do arquivo quando localizado. Credenciais fictícias existentes continuam locais em `.data`.
- Concluir esta etapa antes de iniciar outra. Ao retomar, consultar status/diff e logs `.data/dentist-version-*`; não repetir revisão geral. Commit/push e confirmação HEAD remoto são obrigatórios ao entregar.
