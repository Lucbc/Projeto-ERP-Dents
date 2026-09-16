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
| 1C | Administração, bootstrap e autenticação | Em andamento: 1C.1 concluída | Sem promoção indevida; último administrador protegido; bootstrap exclusivo; sessões revogáveis; segredos/tentativas/senhas tratados |
| 1D | Exames, erros e dependências de segurança | Pendente | Limites/tipos e visualização seguros; ciclo de vida consistente; dependências compatíveis verificadas |
| 2A | Concorrência de agenda e cobrança | Pendente | PostgreSQL rejeita conflitos simultâneos; geração idempotente |
| 2B | Edição concorrente e histórico financeiro | Pendente | Alterações não se perdem; baixa idempotente; pagamentos/estornos rastreáveis |
| 3 | Datas, cadastros, permissões, paginação, atualização entre PCs e interação | Pendente | Cenários por perfil e dados representativos aprovados |
| 4 | Atendimento/prontuário e estrutura de cobrança/pagamentos | Pendente | Escopo validado com a clínica; histórico e autoria preservados |
| 5 | Instalação assistida, HTTPS, backup, atualização e recuperação | Pendente | Instalar, reiniciar, atualizar e restaurar em ambiente isolado com roteiro simples |
| 6 | Homologação final, carga, usabilidade e piloto | Pendente | Critérios da revisão atendidos e limitações aceitas explicitamente |

Etapa 1A é pequena e pode ser concluída junto com a preparação da etapa 0. Funcionalidades de prontuário, parcelamento e instalação final terão decisões próprias antes da implementação.

## Entrega atual

**Entrega concluída:** etapa 1C.1 — limites administrativos e último administrador ativo (R08/R09). Evidências em [homologação 1C.1](./homologacao-etapa-1C1.md). Etapas anteriores publicadas no commit `537065a`; esta entrega deve terminar com commit/push conforme a regra do projeto. Próximo recorte: 1C.2, bootstrap exclusivo e ativação inicial.

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

### Ponto de retomada atual — etapa 1C.1 concluída em 15/09/2026

- Gestão de usuários recebe o ator autenticado; casos de uso relêem identidade/permissões sob bloqueio transacional. Não administradores não criam/promovem/alteram/excluem/redefinem senha de administradores.
- PostgreSQL serializa gravações administrativas; último administrador ativo preservado em exclusão, inativação e rebaixamento, inclusive simultâneos. Sem migração de banco.
- Interface oculta ações/opção de administrador para delegados e informa a necessidade de manter um admin ativo. Alterar o próprio perfil/status ou excluir a própria conta encerra a sessão local.
- Validação: 16 testes PostgreSQL, 15 frontend, 7 grupos HTTP administrativos e 10 grupos de fluxo geral passaram. Concorrência observada em `pg_locks`; três cenários preservaram um admin ativo.
- Interface conferida no Chrome. Fixtures desta etapa removidas e permissões originais de coordenador restauradas. Nenhum schema de teste restante. Containers de homologação ativos e atualizados; dados da etapa 0 preservados.
- Evidências/comandos: `docs/homologacao-etapa-1C1.md`. Testes PostgreSQL em `apps/api/tests/test_user_administration.py`; HTTP em `scripts/smoke_admin_homolog.py`.
- Regra permanente de commit/push registrada em AGENTS.md. Consultar `git log -1` e `git status` ao retomar; nunca publicar `.env.homolog`, `.data` ou volumes. Git sincroniza código/documentação, não os dados locais do Docker.
- **Próximo recorte: 1C.2 — bootstrap exclusivo e ativação inicial controlada (R10).** Mapear bootstrap, segredo de instalação e experiência de primeira execução; testar disputa entre requisições em banco isolado e inicialização com banco existente. Revogação de sessões/senhas fica em recorte posterior de 1C.
