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

## Retomada em 12/11

**12/11/2026 — B.1 bloqueada pelo scanner de imagens, correção iniciada:** CI 42932186738 terminou com 557 frontend e 411 backend aprovados (797,756 s), mas reprovou no scanner: krb5-libs 1.22.2-r1 em API/DB e libxslt 1.1.43-r3 em web/gateway/edge/DB. Fixar versões indicadas no relatório (1.22.3-r0 e 1.1.43-r4), reconstruir/verificar as seis imagens e regressões antes de novo CI. B.2 ainda não iniciada. Sem alterações de volumes ou migrações; não instalar main parcial.

### Correção das imagens — aceites locais em 12/11

Quatro Dockerfiles alterados: API fixa krb5-libs 1.22.3-r0; PostgreSQL fixa também libxslt 1.1.43-r4; web e base compartilhada de gateway/edge fixam libxslt 1.1.43-r4. Preservados digests de base, PostgreSQL 16, configuração, volumes e entrypoints. Nenhuma mudança na API de auditoria ou migrações.

- Build das seis imagens aprovado; versões corrigidas disponíveis no repositório apk e resolvidas pelo build.
- Scanner Trivy aprovado nas seis imagens, sem achados; base de vulnerabilidades atualizada em 12/11/2026 às 07:01 UTC. Sem exclusão de regras ou supressão de achados.
- Nova imagem PostgreSQL inicializou, gravou tabela fictícia, gerou dump e restaurou em banco privado. Contêiner sem rede/portas e com tmpfs, removido no final; não montou volumes principais. Isso não substitui o ensaio completo de recuperação da aplicação em C.
- Cadastros Chrome/API/SQL aprovados com novas imagens API/web: CPF/nascimento/documentos históricos/RG/permissões/busca/conflito/reabertura/reinício. Primeiro ensaio parou porque API/DB/web de homologação estavam desligados desde o dia anterior; reiniciados os contêineres existentes sem recriar/remover volumes. Ensaio repetido e aprovado, recursos temporários removidos.
- Logs ignorados: `.data/access-reader-security-build.log`, `.data/access-reader-security-scan.log`, `.data/access-reader-security-db.log`, `.data/access-reader-security-registration.log`.
- Roteiros de instalação/atualização/liberação/checklist sinalizam que a tag v0.1.30 ainda não contém estes patches. Não instalar main parcial. Se a implantação física anteceder o fechamento da auditoria, preparar/homologar patch isolado sobre v0.1.30 antes de nova tag.

Próximo: CI completo da correção; só então encerrar B.1 e iniciar B.2. Nenhuma nova versão instalável publicada nesta correção.

## Fechamento B.1

**6D.3.3B.1 concluída — 12/11/2026:** produto `97001e6`; [CI 43219031029](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/43219031029) aprovado: 557 frontend, 411 backend (795,292 s), HTTP e seis imagens sem achados. Consulta paginada/filtrada, permissão própria, revogação concorrente e matriz Chrome/API/SQL aprovadas. Correção krb5-libs/libxslt validada também em builds/scanner/banco privado e cadastros. [Relatório](./homologacao-etapa-6D-3-3B.md). **Próximo B.2:** tela Histórico de acessos com filtros/paginação/estados/cache, semântica de consulta autorizada/download preparado e aceite Chrome. Depois capacidade e recuperação completa antes de tag. Não repetir B.1 sem mudança/falha. Tag v0.1.30 ainda não inclui os patches; instalação física exige pacote corrigido, isolado sobre a tag se antecipada. Não instalar main parcial. Este fechamento substitui as pendências de CI abaixo.

Log ignorado `.data/access-reader-security-ci-final.log`. Nenhuma mudança de aplicação/imagens depois do produto aprovado; fechamento documental. Tela do histórico ainda não implementada.

## B.2 — interface do histórico (12/11/2026)

Base `2ba2e13`. Menu e rota `/access-audit` protegidos por `access_audit.view`; filtros por ação, responsável, paciente, alvo e período de São Paulo, paginação por cursor e atualização. Estados de carregamento, vazio, falha e recuperação; negação 401/403 remove resultados/cache. Exibe apenas metadados, distingue consulta autorizada de leitura humana e download preparado de entrega efetiva. Nenhuma mudança de API, banco, migração ou instalação nesta subetapa.

### Validação local

- Componentes: dez testes aprovados (14,12 s), incluindo cache/permissão, filtros, paginação e semântica dos eventos. Build web aprovado.
- Chrome/API: administrador e leitor concedido; acesso negado e revogado, paginação 25+7, filtros de ação/alvo/paciente/período, erro 503 com recuperação e resultado vazio. Fuso do navegador diferente do fuso da clínica no ensaio.
- Banco: 32 eventos históricos exclusivamente sintéticos inseridos por SQL em esquema privado; hash integral preservado após navegação e dois eventos administrativos de alteração de permissão. Este aceite valida a leitura, não substitui os testes de geração autenticada de eventos em A/B.1.
- Capturas desktop e 390 px inspecionadas: conteúdo legível, sem transbordamento horizontal.
- Regressão de cadastros Chrome/API/SQL aprovada: CPF, nascimento, dados históricos, RG, permissões, busca, conflito, reabertura e reinício. Recursos temporários removidos, volumes principais preservados.
- Evidências locais ignoradas: `.data/access-history-components.log`, `.data/access-history-build.log`, `.data/access-history-chrome.log`, `.data/access-history-registration.log` e capturas `access-audit-history-desktop.png`/`access-audit-history-mobile.png`.

CI completo pendente. Próximo: conferir CI antes de concluir B.2; depois capacidade/índices e migração/recuperação completa antes de publicar nova tag. A instalação permanece condicionada ao pacote corrigido e checklist físico conforme os guias atuais.
