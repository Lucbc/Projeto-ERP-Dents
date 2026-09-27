# Homologação 2B.8.2.1 — autorização coordenada de permissões

Iniciada em 26/09/2026, base `8ecd3b3`. Primeiro recorte da 2B.8.2; sem migração ou alteração visual.

## Contrato implementado

- PUT de permissões encaminha o identificador da sessão assinada e o autor autenticado ao caso de uso. A dependência HTTP continua exigindo administrador; o caso de uso não confia somente nessa leitura anterior.
- Sob o mesmo bloqueio administrativo das escritas de usuários (`LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`), o caso de uso descarta identidades ORM antigas, verifica sessão pertencente ao autor e ainda válida, relê autor ativo/administrador e só então valida/grava a matriz. Mesma sessão SQL para as duas operações; erro faz rollback e libera o bloqueio.
- Logout passa a participar desse protocolo, mantendo idempotência e revogação exclusiva da sessão escolhida. Alteração de usuário, exclusão, redefinição/troca de senha e criação de sessão já usam o bloqueio. Leituras comuns continuam disponíveis.
- Validade da sessão usa `clock_timestamp()` do PostgreSQL. `now()` representa o início da transação e poderia autorizar uma sessão expirada durante a espera pelo bloqueio. A checagem ocorre no ponto de autorização, sem prometer cancelar uma operação já autorizada/confirmada.
- Revogação da permissão de editar usuários e a própria edição passam a ser ordenadas pelo mesmo bloqueio. A edição relê a matriz após esperar. Último administrador, delegação e defaults não mudam.

## Validação

- Oito testes novos em `test_permission_authorization.py`, schemas privados migrados e conexões independentes; espera verificada por `pg_blocking_pids`, sem inferir concorrência apenas por atraso.
- Duas ordens para inativação/rebaixamento/exclusão/redefinição de senha/logout × gravação de permissões: revogação primeiro impede a escrita; gravação primeiro confirma e depois a revogação conclui. Inclui entidade ORM carregada antes da espera.
- Matriz antiga no ORM × revogação da delegação/edição de usuário nas duas ordens; autor alterado mantendo sessão legada; expiração posterior ao início da transação; sessão de outro autor; falha depois do flush com rollback; validações do administrador/recursos inválidos.
- Regressão de leituras foi adaptada para fornecer autor/sessão válidos nas duas escritas explícitas. Defaults, ausência de gravação em leitura e preservação de JSON continuam cobertos.
- Novo harness HTTP autenticado verifica ligação da sessão ao PUT, revogação nos cinco fluxos, ausência de matrizes nas recusas e delegação. Não é uma corrida HTTP simultânea; concorrência é evidência dos testes de banco/casos de uso acima.
- Primeira tentativa HTTP esperava 401 na mutação anônima; o middleware de proteção CSRF corretamente rejeita antes da rota com 403. Corrigida somente a expectativa do teste.
- **70 testes focados aprovados em 263,547s**; complemento da alteração compatível de nome durante espera aprovado em **4,699s**. Build API aprovado. HTTP de autorização e regressão de leituras aprovados, dez grupos cada. CI e preservação serão registrados ao concluir. Nenhum Chrome novo: não houve alteração de interface.

## Entrega e limites

Cópias públicas/exames/fingerprints `pre-2B8-2-1*` locais, helper `.data/upgrade_2b821.py`. Credenciais, logs e cópias fora do Git; não remover volumes.

Implementação `e9066fa` publicada, HEAD remoto conferido; [CI 36320437271](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/36320437271) em andamento. Dump completo salvo após limpeza dos schemas privados; API principal atualizada em **https://localhost:18443**. Primeira chamada durante startup retornou 502; após prontidão, HTTPS 200 e dez verificações gerais aprovadas. Comparação integral confirmou negócio/histórico/bytes preservados; revisão `0022_dentist_user_restrict`, zero schemas e nenhum volume removido. Web sem alteração.

Esta etapa **não impede salvar uma matriz antiga**. Isso exige versão por perfil e mudanças de interface na **2B.8.2.2**, conforme [plano](./plano-etapa-2B8.md). Não adiciona rechecagem de sessão sob bloqueio a todos os outros recursos do ERP. SQL externo que ignora o protocolo fica fora da coordenação. R18 permanece parcial; usuários/senha/exclusão versionados continuam na 2B.8.3.

## Correção de inicialização identificada no CI

As execuções `36320437271` e `36321056042` falharam antes do backend. Frontend (106 testes), build e dependências passaram. O diagnóstico adicional publicado em `a85ad6e` confirmou uma corrida: FreshClam baixou/testou `28136` de 27/09, mas notificou antes de existir o socket; clamd manteve `28129` de 20/09 mesmo após SelfCheck. Não foi falha de download nem dos testes administrativos.

Adicionado hook oficial `OnUpdateExecute` nos três Compose: solicita RELOAD, aguarda prontidão com prazo de cinco minutos e limita cada chamada a cinco segundos. Não altera healthcheck, política de sete dias, digest ou volumes existentes. Detalhes e fonte em [operação de exames](./operacao-exames.md).

Testes determinísticos de sucesso imediato, atraso e timeout aprovados. Inicialização real em container descartável reproduziu a notificação perdida e confirmou recarga para `28136` pelo hook. Apenas o container e seu volume anônimo exclusivo foram descartados. **28 scripts HTTP/prontidão locais passaram**, seis imagens sem achados. Backend completo local/novo CI e atualização do ClamAV principal ainda pendentes; a regressão local adicional foi motivada pela indisponibilidade do CI.
