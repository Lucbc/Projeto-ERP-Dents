# 6D.3.1B — consulta protegida da auditoria administrativa

## B.1 — API e concessão de leitura (início 07/11/2026)

Base `d5d14a6`. Implementada, em validação; B.2 (tela de histórico/Chrome) ainda pendente. Nenhuma tag instalável nesta subetapa.

### Contrato

- GET `/api/administrative-audit`: metadados tipados, sem nomes/e-mails/credenciais. IDs de contas excluídas permanecem consultáveis. Não existe endpoint para alterar eventos.
- Administrador ativo consulta; outros perfis precisam de concessão `administrative_audit.view`. Demais ações sempre falsas, inclusive no normalizador, no verificador e na matriz visual. A edição de outras permissões preserva a concessão de auditoria.
- Conta, sessão e permissão reconsultadas sob o mesmo bloqueio das alterações administrativas, antes da leitura. Revogação concluída enquanto a consulta aguarda impede a resposta de dados.
- Limite padrão 25, máximo 100. Ordem decrescente por instante/ID; cursor pela última chave, sem contagem total ou promessa de fotografia entre páginas. Filtros por ação, ator (`author_id`), usuário-alvo, perfil e período; usuário/perfil são mutuamente exclusivos. Início inclusivo, fim exclusivo; data/hora com fuso obrigatório. Filtros/cursor não concedem acesso.
- SQL vincula valores; resposta enumera campos permitidos. Cabeçalho `Cache-Control: no-store`. Sem novas tabelas/migrações além da 0027 já introduzida em A.

### Evidências em andamento

- Cinco testes novos aprovados, 13,013 s: normalização, acesso/revogação/sessão, paginação sob inserção, empate de instante, filtros/intervalos e revogação concorrente real no PostgreSQL privado. `.data/audit-read-tests.log`.
- HTTP/SQL aprovado: anônimo 401, sem concessão 403, concessão/revogação na sessão existente, conta excluída/paginação/filtros, entradas inválidas e ausência de segredos. POST recusado e leituras não alteram o histórico. `.data/audit-read-http.log`; harness existente ampliado e incluído no CI.
- Build frontend aprovado; regressão de componentes em execução. Não é aceite Chrome. A interface de consulta ainda não existe.
- CI completo pendente; registrar execução/resultado antes de concluir B.1.

### Pendências e retomada

Concluir testes/CI, depois B.2: tela de consulta, estados/permissão/cache e Chrome. Antes de publicação: recuperação/migração 0026→0027, atualização do harness de recuperação, regressão de cadastros e guias/tag. Instalação nova v0.1.28 continua aguardando pacote com zlib corrigida; não instalar HEAD parcial. Dados/volumes principais preservados.
