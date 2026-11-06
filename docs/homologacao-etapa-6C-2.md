# 6C.2 — teclado, modais e busca na Consulta

Diagnóstico na base `5c02850`, em 05/11/2026, com 101 pacientes fictícios e recursos privados de `erp-dents-homolog`.

## Evidência e correção

Chrome confirmou que o modal anterior não recebia foco ao abrir, permitia saída com Tab/Shift+Tab e não restaurava o botão de origem ao fechar. Busca de paciente fora dos primeiros 100 e foco do campo nome após validação já funcionavam; não exigiram mudança da Consulta ou API.

O componente compartilhado passa a usar `dialog.showModal()`, título acessível e botão “Fechar janela”. O diálogo nativo impede interação com o fundo; o tratamento de Tab/Shift+Tab mantém o ciclo nos controles habilitados/visíveis. Fechamento restaura o elemento de origem conectado. Escape cancela o fechamento nativo e consulta o mesmo `onClose` dos botões, preservando os bloqueios de gravação e confirmação de descarte existentes. Nenhuma dependência ou migração nova.

Referência técnica: [diálogo HTML/MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog). O teste no navegador mostrou que apenas o comportamento nativo ainda permitia a saída do último controle para a interface do navegador, por isso o ciclo explícito foi acrescentado.

## Validação

- **Chrome:** aceitação de foco inicial, 65 Tab, oito Shift+Tab, retorno ao botão de origem, Escape, campo inválido sem POST e rascunho preservado após 422. Escape e botão fechar não encerraram uma gravação pendente. Captura desktop inspecionada. Logs locais `.data/usability-diagnosis.log` e `.data/usability-acceptance-final.log`; métricas sem dados pessoais em `.data/homolog/usability-keyboard*.json`.
- **HTTP/SQL:** paciente ausente da página inicial de 100 encontrado e aberto por teclado na Consulta; os 101 registros permaneceram com versão 1, sem gravação causada pelo teste de erro. Bootstrap/reinício e limpeza privados aprovados, volumes principais preservados.
- **Componentes:** três testes de ciclo de vida, título, fechamento condicionado e interação interna aprovados. O shim de `dialog` no jsdom somente permite testar ciclo de vida; não simula nem comprova confinamento de foco. Suíte completa final: **526/526 em 54 arquivos** aprovada; teste legado atualizado para o novo nome acessível do botão.
- **Regressões Chrome/API/SQL:** cadastros, financeiro restrito, descarte de rascunhos, calendário, exclusão/isolamento de exames e escrita clínica aprovados. Capturas e downloads de exames, conflitos, permissões, horários e persistência mantidos. Logs locais `.data/modal-registration.log`, `.data/modal-billing.log`, `.data/modal-patient_unsaved.log`, `.data/modal-calendar_references_browser.log`, `.data/modal-exam_deletion_browser.log`, `.data/modal-exam_isolation_browser.log`, `.data/modal-clinical-writer.log`.
- **Build final:** imagem web reconstruída após o patch de dependência; artefatos de navegador mantiveram os mesmos nomes com hash. Aceite Chrome/SQL de teclado/busca repetido nessa imagem (`.data/usability-patched.log`) e aprovado.
- **CI final:** [42093636149](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/42093636149), código `e4ec7e7`, aprovado: 526 frontend e 368 backend (692,219 s), builds/HTTP e seis imagens sem achados. A execução anterior `42047559900` passou nos testes e falhou na auditoria das imagens por libexpat. Pacote v0.1.27 consolidado em 06/11, sem nova migração.

## Limites e retomada

Não certifica acessibilidade completa, leitor de tela ou todos os campos/erros do ERP. Suíte e regressões locais concluídas; CI aprovado; pacote/guias v0.1.27 em publicação final. O diagnóstico adicional 6D.1 está no relatório próprio; depois, cobertura histórica/multidia da agenda. Preservar prioridade P3 físico e odontograma mapeado para depois. Sem alterar regras clínicas/financeiras nesta correção compartilhada.

## Ajuste de dependência durante o CI

O CI `42047015437` interrompeu na auditoria npm por [GHSA-mrwp-f3q8-3g9p](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p). Lockfile atualizado somente de follow-redirects 1.16.1 para 1.16.2; auditoria npm local passou sem achados. O aviso descreve uso Node com arrays de outro contexto; não foi demonstrada exploração no ERP e o próprio aviso não reproduz o caso no Axios 1.20.0. Novo CI e build necessários antes de liberar o pacote.

A auditoria local e o CI `42047559900` identificaram três alertas HIGH de libexpat 2.9.0-r0 (CVE-2026-113351, CVE-2026-117610, CVE-2026-118370). Os dois Dockerfiles agora fixam 2.10.0-r0; web/gateway/edge reconstruídos sem alterar configuração ou volumes. Repetir auditoria e CI dessa revisão antes da publicação.

Auditoria local após reconstrução: seis imagens sem achados (`.data/modal-images-fixed.log`). Ensaio adicional de instalação nova interrompido antes dos containers: `configure-server.ps1` falhou em `Set-Acl` por relação de confiança deste Windows com o domínio. Não houve bypass de ACL, alteração de domínio ou configuração de produção. Os preparadores não mudaram; esse ensaio adicional não será declarado aprovado. Fumaça da imagem web final e CI da revisão `e4ec7e7` permanecem como aceites separados; P3 físico ainda exige seu checklist.

Cadastros Chrome/API/SQL passaram novamente na imagem final com libexpat 2.10.0-r0 (`.data/modal-registration-runtime-final.log`). CI final também verifica o conjunto completo de serviços e proxies. Não houve reinício dos containers principais ou remoção de volumes.
