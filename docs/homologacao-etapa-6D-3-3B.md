# 6D.3.3B — consulta do histórico de acessos

## B.1 — implementação em 10/11/2026

Base `9437a46`; API e configuração de permissões. Não inclui ainda a tela de histórico (B.2), ensaio de capacidade nem recuperação completa 0030. Instalação v0.1.30 preservada.

### Mudanças

- GET `/api/access-audit`, resposta tipada somente com metadados. Padrão 25 eventos, máximo 100; ordem por instante/ID decrescente, cursor pela última chave. Filtros opcionais: ação (quatro existentes), ator, paciente, alvo e intervalo com fuso explícito, fim exclusivo.
- Revalida conta ativa, sessão e concessão sob bloqueio administrativo antes de consultar. Permissão `access_audit.view`: administrador ativo pode ler; outros perfis começam negados e dependem de concessão. Criar/editar/excluir permanecem falsos; o acesso não concede prontuário/exames nem altera suas regras.
- Retorna IDs/versões dos registros, quantidade/paginação da consulta original; paciente pode ser nulo em consulta de agendamento desconhecido. Não consulta tabelas pessoais para enriquecer nomes nem copia conteúdo de prontuário/arquivo. Sem gravação recursiva ao ler auditoria; `Cache-Control: no-store`.
- Matriz da interface recebe o recurso somente leitura, preservando concessão ao editar outros recursos. Sem nova migração ou variável de configuração.

### Validação separada

- Cinco testes backend aprovados em 31,649 s: normalização para quatro perfis, filtros/paginação por cursor com inserção entre páginas, empate de instante, parâmetros inválidos, conta/sessão/concessão e revogação real enquanto a consulta aguarda bloqueio. Fixtures de metadados são inserções SQL fictícias declaradas; o HTTP abaixo usa eventos de operações reais.
- 44 testes frontend focados aprovados (22,35 s), incluindo cinco novos de permissão efetiva e preservação da concessão. Builds das imagens API/web aprovados.
- HTTP/SQL clínico aprovado: eventos reais, ator/alvo/versões, paginação/filtros, no-store, 401/403, parâmetros/cursor inválidos e método de escrita recusado. Auditor com permissão própria continua sem leitura clínica/exames. Revogação imediata bloqueia consulta; eventos permanecem iguais após ler auditoria.
- HTTP dos eventos de download aprovado: filtro por ação/alvo retorna os cinco eventos reais, incluindo preparação seguida de 416, sem conteúdo ou paginação clínica inventada. Chrome/API/SQL da matriz aprovado: concessão, recarga, preservação ao editar outra permissão e revogação; três eventos administrativos duráveis. Controles de escrita desabilitados. Recursos privados removidos, principais preservados. CI completo é a pendência para fechar B.1.
- Logs locais ignorados: `.data/access-reader-tests.log`, `.data/access-reader-web.log`, `.data/access-reader-build.log`, `.data/access-reader-http.log`, `.data/access-reader-exams-http.log`, `.data/access-reader-permissions-chrome.log`.

### Próximo

Conferir CI antes de fechar B.1. Depois B.2: tela de histórico com semântica de consulta autorizada/download preparado, filtros/estados/cache e aceite Chrome. Medir capacidade e índices antes de publicar; recuperação 0028→0029→0030 ainda em C. Não instalar main parcial nem repetir aceites aprovados sem mudança/falha.

**CI de B.1 em acompanhamento:** produto `01c985a`; [execução 42932186738](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/42932186738). Aceites locais aprovados, aguardando CI antes de declarar B.1 concluída e avançar à tela B.2. Sem mudança de produto após esse commit; instalação v0.1.30 preservada.
