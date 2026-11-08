# 6D.3.1B — consulta protegida da auditoria administrativa

## B.1 — API e concessão de leitura (início 07/11/2026)

Base `d5d14a6`, produto `267cee5`. B.1 concluída em 08/11/2026 após conferência dos resultados; B.2 (tela de histórico/Chrome) ainda pendente. Nenhuma tag instalável nesta subetapa.

### Contrato

- GET `/api/administrative-audit`: metadados tipados, sem nomes/e-mails/credenciais. IDs de contas excluídas permanecem consultáveis. Não existe endpoint para alterar eventos.
- Administrador ativo consulta; outros perfis precisam de concessão `administrative_audit.view`. Demais ações sempre falsas, inclusive no normalizador, no verificador e na matriz visual. A edição de outras permissões preserva a concessão de auditoria.
- Conta, sessão e permissão reconsultadas sob o mesmo bloqueio das alterações administrativas, antes da leitura. Revogação concluída enquanto a consulta aguarda impede a resposta de dados.
- Limite padrão 25, máximo 100. Ordem decrescente por instante/ID; cursor pela última chave, sem contagem total ou promessa de fotografia entre páginas. Filtros por ação, ator (`author_id`), usuário-alvo, perfil e período; usuário/perfil são mutuamente exclusivos. Início inclusivo, fim exclusivo; data/hora com fuso obrigatório. Filtros/cursor não concedem acesso.
- SQL vincula valores; resposta enumera campos permitidos. Cabeçalho `Cache-Control: no-store`. Sem novas tabelas/migrações além da 0027 já introduzida em A.

### Evidências aprovadas

- Cinco testes novos aprovados, 13,013 s: normalização, acesso/revogação/sessão, paginação sob inserção, empate de instante, filtros/intervalos e revogação concorrente real no PostgreSQL privado. `.data/audit-read-tests.log`.
- HTTP/SQL aprovado: anônimo 401, sem concessão 403, concessão/revogação na sessão existente, conta excluída/paginação/filtros, entradas inválidas e ausência de segredos. POST recusado e leituras não alteram o histórico. `.data/audit-read-http.log`; harness existente ampliado e incluído no CI.
- Build frontend e 535 testes de componentes aprovados localmente (`.data/audit-read-web.log`, 169,40 s). Ensaio focado de permissões: 34 testes aprovados.
- **Chrome/API/SQL:** controles de auditoria permitem apenas leitura; conceder, salvar outra permissão, recarregar e revogar preservam o contrato. Banco confirmou três eventos duráveis e concessão final revogada. `.data/audit-read-chrome.log`; scripts `smoke_audit_permission_browser_homolog.py/.cjs`. Isso homologa a matriz de concessões, não uma tela de histórico, que ainda não existe. API/esquema temporários removidos e dados/volumes principais preservados.
- **CI aprovado:** [42411551662](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/42411551662), produto `267cee5`: 535 frontend, 380 backend (734,253 s), fluxos HTTP e seis imagens sem achados. Resultado conferido em 08/11; execução de 07/11, log `.data/audit-read-ci-final.log`.

### Pendências e retomada

Próximo B.2: tela de consulta, estados/permissão/cache e Chrome. Antes de publicação: recuperação/migração 0026→0027, atualização do harness de recuperação, regressão de cadastros e guias/tag. Instalação nova v0.1.28 continua aguardando pacote com zlib corrigida; não instalar HEAD parcial. Dados/volumes principais preservados.

## B.2 — tela de histórico (início 08/11/2026)

Base `187f665`. Implementada, em validação. Rota `/administrative-audit` e menu seguem a permissão própria, sem exigir administração de usuários. Eventos mostram ação traduzida, instante de São Paulo, IDs preservados, versões e diferenças de campos/concessões; sem edição/exclusão/exportação.

Filtros aplicados explicitamente por ação, responsável, usuário/perfil e intervalo no fuso clínico. Valores inválidos não disparam consulta; mudança de filtro retorna à primeira página. Paginação de 25 por cursor com anterior/próxima; atualização retorna à primeira página. Erro de rede sinaliza dados desatualizados; vazio é distinto de erro. Revogação oculta eventos e remove cache; respostas não são persistidas no navegador.

Cinco testes novos de componentes aprovados: identificação histórica/horário, paginação/filtros, validação, permissão/cache e erro/negação HTTP. Build e imagem web aprovados. Regressão completa e Chrome/API/SQL em andamento; CI pendente. Harness usa 32 eventos sintéticos no esquema privado (não são autoria histórica real), conta fictícia e duas alterações de concessão. Capturas locais somente fictícias em `.data/audit-history-desktop.png` e `.data/audit-history-mobile.png`, fora do Git.

A conclusão B.2 depende desses aceites. Recuperação/migração e publicação continuam pendentes; o roteiro de instalação ainda aponta a necessidade de tag corrigida, sem instalar HEAD parcial.
