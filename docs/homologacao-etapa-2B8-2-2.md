# Homologação 2B.8.2.2 — versões das permissões

## Comportamento

Cada matriz possui uma versão. Um formulário antigo recebe 409 `stale_version` sem sobrescrever a alteração mais recente. O cliente deve carregar explicitamente a matriz atual e revisar antes de salvar. Cada gravação aceita incrementa a versão, inclusive sem mudança efetiva; matrizes ausentes usam versão virtual zero, sem gravação nas leituras. Administrador permanece imutável.

A migração `0023_permission_version` acrescenta versão 1 às linhas existentes e uma restrição positiva, preservando JSON e timestamps. API e web precisam ser atualizados juntos: PUT exige versão inteira, sem compatibilidade implícita com clientes antigos. A autorização e a sessão continuam revalidadas sob o protocolo administrativo da 2B.8.2.1 antes da comparação e gravação atômicas.

A interface mantém rascunhos independentes por perfil. Conflito ou falha de resultado incerto bloqueia nova gravação até recarga explícita. Falha nessa recarga preserva o rascunho e o bloqueio; sucesso substitui somente o perfil escolhido, sem reenvio automático. Perda de acesso limpa as matrizes em cache e oculta os rascunhos.

## Validação local

- Banco/API: execução focada de 37 métodos em 157,940s teve 35 aprovados e duas falhas de preparação dos testes novos/adaptados. Corrigidos parâmetro JSON da migração e preparação sob mock de revogação; os dois métodos passaram em 17,090s. Sete testes novos cobrem versão estrita, primeira escrita concorrente, formulário antigo, independência de perfis/cache ORM, rollback, revogação anterior ao conflito e migração de ida/volta preservando dados.
- Componentes: sete testes aprovados em 4,00s, incluindo rascunhos, conflito, falha de recarga, versão zero e perda de acesso. Expectativas iniciais foram corrigidas para os rótulos já existentes na aplicação.
- HTTP autenticado: dez grupos aprovados em API/schema exclusivos, com contratos 422/409, recarga, perfil ausente, administrador imutável e sessão revogada. Incluído no CI. Fixtures dos testes anteriores passaram a fornecer a versão; produção não usa esse preenchimento automático.
- Chrome: duas abas reais confirmaram conflito, falha simulada de recarga, recarga explícita sem salvar, nova gravação, preservação do rascunho de outro perfil e redirecionamento após revogação. Capturas locais de conflito e independência inspecionadas visualmente; conteúdo legível e ações coerentes. Harness encerrou API/schema privados.
- Builds API e web aprovados. Logs, capturas, credenciais e cópias permanecem ignorados pelo Git.

## Publicação e preservação

Implementação `362c051` publicada e HEAD remoto conferido. CI completo `36345652856` em andamento; ainda não contar como aprovado.

Cópias públicas/exames/fingerprints e dump completo salvos em `pre-2B8-2-2*`, este último após limpeza dos schemas privados; helper local `.data/upgrade_2b822.py`. API e web da homologação atualizados juntos. HTTPS 200 e dez verificações gerais aprovados. Comparação confirmou negócio, referências históricas e bytes dos exames preservados. Revisão `0023_permission_version`, três matrizes originais na versão 1, zero schemas privados e nenhum volume removido. A comparação exclui somente a nova coluna e a revisão Alembic, mantendo comparação do JSON original e timestamps.

## Limite e próximo passo

Esta entrega protege matrizes de permissões. Formulários de usuários, senha e exclusão seguem para 2B.8.3; R18 permanece parcial. Não repetir a revisão geral ou as etapas já concluídas.
