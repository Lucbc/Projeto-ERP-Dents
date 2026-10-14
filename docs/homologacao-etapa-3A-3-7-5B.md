# 3A.3.7.5B — sessão durante navegação e barreira entre recursos

Iniciada em 13/10/2026, base `d25e13d`. **Em validação; R19 permanece aberto.** [Matriz e critérios](./plano-etapa-3A-3-7-5.md).

## Defeito reproduzido e correção 3A.3.7.5B.1

Ao navegar do Financeiro para Pacientes, o React Router reutiliza `ProtectedRoute`. A máscara de ações financeiras inclui o bit de estorno; a do próximo recurso não inclui esse bit. O estado de revisão era compartilhado entre os recursos e interpretava essa diferença como revogação. O formulário ficava desabilitado e a revisão não podia ser concluída. Isso também explica a falha do clique manual no painel em 3A.3.7.5A: suas medições de leitura continuam válidas, mas não provavam que ações estavam habilitadas.

- Chrome reproduziu com administrador e captura fictícia `.data/homolog/session-draft-preparation.png` inspecionada; testes com roteador reproduziram em admin e recepção: **2 falhas novas, 10 testes existentes aprovados**, antes da correção (`.data/tests-3a375b-before.log`).
- `ProtectedRoute` agora identifica o recurso ao guardar a revisão. Trocar recurso inicia seu estado próprio; revogar permissão na mesma tela continua conservando rascunho/tentativa e exigindo revisão explícita. Nenhuma mudança de API/schema ou concessão de acesso.
- 35 testes focados de integração de permissões e sessão aprovados (2,32s), incluindo a regressão da navegação e as provas existentes de revogação, rascunho, versão e idempotência (`.data/tests-3a375b-focused.log`).

## Ensaio Chrome/API

Novo `smoke_navigation_session_browser_homolog.py`/`.cjs`: API/schema temporários no `erp-dents-homolog`, dados fictícios, escritor e leitor em sessões independentes. Percurso por menu sem recarregar o documento, rascunho aberto, resposta real de pacientes retida, revogação da conta pela outra sessão e 401 autenticado. Exige remoção do rascunho/dados, 32s sem polling privado no login, nova identidade de recepção no mesmo documento, cancelamento da requisição antiga e ausência de restauração após tentativa de entrega tardia. Verifica referências independentes, menu/rota negados e 403 real do recurso sem perder a nova sessão.

O caso tardio no Chrome comprova cancelamento do transporte e isolamento visível; respostas antigas que ignoram cancelamento também têm cobertura em `session.test.tsx`. A requisição direta que comprova 403 usa `fetch`; o comportamento do interceptor para 403 continua coberto pelos testes de sessão. Não confundir as duas camadas. Saída do ensaio contém somente estágios/resultados fixos; credenciais e payloads permanecem em memória.

Tentativas intermediárias anteriores à correção: `.data/browser-3a375b.log`, `.data/browser-3a375b-retry.log`, `.data/browser-3a375b-draft.log`. Localizaram o bloqueio real no clique de edição. Não são homologação aprovada.

## Validações e retomada

- 341 testes frontend/41 arquivos aprovados (86,71s); TypeScript/Vite aprovado (21,29s), imagem web construída. Auditorias npm/Python e seis imagens Docker sem achados. Logs `.data/tests-3a375b-full.log`, `.data/build-3a375b.log`, `.data/audit-dependencies-3a375b.log`, `.data/audit-images-3a375b.log`. Aviso existente de bundle acima de 500kB permanece.
- Chrome final e CI pendentes; não concluir esta etapa antes do aceite integrado e preservação.
- Backups originais `pre-3A-3-7-5B*` já criados e preservados. Helper `.data/upgrade_3a375b.py`: **somente `after`**; não repetir `before/full`.
- Docker Desktop estava desligado na retomada e foi iniciado; serviços existentes de homologação retomados com `up -d --no-build`, sem remover volumes. Isso foi recuperação do ambiente, não atualização da aplicação. Atualização somente web/HTTPS/preservação ainda pendente.
- Após todos os aceites, consolidar matriz R19 e seu escopo: polling de 15s/60s, referências estáveis por ação, listas limitadas e janela financeira. Não comprova capacidade, estações físicas ou outros navegadores. Datas/fusos e paginação continuam na etapa 3; instalação assistida na etapa 5.

## Checkpoint de validação — 13/10/2026

**3A.3.7.5B/3A.3.7.5B.1 implementadas em `44d58be`, aguardando somente CI `38498942069`.** 341 testes frontend/41 arquivos, 35 focados, TypeScript/Vite, npm/Python e seis imagens aprovados. Chrome de sessão e regressão de permissões aprovados; capturas inspecionadas. Somente web atualizada; HTTPS/assets/dez verificações/preservação aprovados, revisão `0024_user_version`, zero schemas temporários. [Evidências](./homologacao-etapa-3A-3-7-5B.md). R19 ainda aberto até o resultado do CI.

**Retomar somente CI e fechamento documental/publicação.** Watch `.data/ci-watch-3a375b.log`; execução `38498942069` corresponde ao código `44d58be`. Backups `pre-3A-3-7-5B*` preservados, helper `.data/upgrade_3a375b.py` somente `after`. Helper local `.data/close_3a375b.py` preparado, exige CI aprovado, relatórios Chrome e preservação; executar uma vez após conferir o CI e salvar seu log. Não repetir testes, auditorias, backups ou atualização aprovados sem mudança/falha. Após aceite, consolidar matriz R19, fechar 3A e registrar próximo recorte: preparação 3B de datas civis/fuso (R20). Instalação assistida permanece na etapa 5.
