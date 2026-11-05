# 6C.2 — teclado, modais e busca na Consulta

Diagnóstico na base `5c02850`, em 05/11/2026, com 101 pacientes fictícios e recursos privados de `erp-dents-homolog`.

## Evidência e correção

Chrome confirmou que o modal anterior não recebia foco ao abrir, permitia saída com Tab/Shift+Tab e não restaurava o botão de origem ao fechar. Busca de paciente fora dos primeiros 100 e foco do campo nome após validação já funcionavam; não exigiram mudança da Consulta ou API.

O componente compartilhado passa a usar `dialog.showModal()`, título acessível e botão “Fechar janela”. O diálogo nativo impede interação com o fundo; o tratamento de Tab/Shift+Tab mantém o ciclo nos controles habilitados/visíveis. Fechamento restaura o elemento de origem conectado. Escape cancela o fechamento nativo e consulta o mesmo `onClose` dos botões, preservando os bloqueios de gravação e confirmação de descarte existentes. Nenhuma dependência ou migração nova.

Referência técnica: [diálogo HTML/MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog). O teste no navegador mostrou que apenas o comportamento nativo ainda permitia a saída do último controle para a interface do navegador, por isso o ciclo explícito foi acrescentado.

## Validação

- **Chrome:** aceitação de foco inicial, 65 Tab, oito Shift+Tab, retorno ao botão de origem, Escape, campo inválido sem POST e rascunho preservado após 422. Escape e botão fechar não encerraram uma gravação pendente. Captura desktop inspecionada. Logs locais `.data/usability-diagnosis.log` e `.data/usability-acceptance-final.log`; métricas sem dados pessoais em `.data/homolog/usability-keyboard*.json`.
- **HTTP/SQL:** paciente ausente da página inicial de 100 encontrado e aberto por teclado na Consulta; os 101 registros permaneceram com versão 1, sem gravação causada pelo teste de erro. Bootstrap/reinício e limpeza privados aprovados, volumes principais preservados.
- **Componentes:** três testes de ciclo de vida, título, fechamento condicionado e interação interna aprovados. O shim de `dialog` no jsdom somente permite testar ciclo de vida; não simula nem comprova confinamento de foco. Suíte completa final em execução; teste legado atualizado para o novo nome acessível do botão.
- **Regressões/CI:** em execução; instalação permanece v0.1.26 até aprovação e consolidação de novo pacote.

## Limites e retomada

Não certifica acessibilidade completa, leitor de tela ou todos os campos/erros do ERP. Próximo imediato: finalizar suíte, regressões de cadastros/agenda/financeiro/exames, CI e pacote com guias. Preservar prioridade P3 físico e odontograma mapeado para depois. Sem alterar regras clínicas/financeiras nesta correção compartilhada.

## Ajuste de dependência durante o CI

O CI `42047015437` interrompeu na auditoria npm por [GHSA-mrwp-f3q8-3g9p](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p). Lockfile atualizado somente de follow-redirects 1.16.1 para 1.16.2; auditoria npm local passou sem achados. O aviso descreve uso Node com arrays de outro contexto; não foi demonstrada exploração no ERP e o próprio aviso não reproduz o caso no Axios 1.20.0. Novo CI e build necessários antes de liberar o pacote.
