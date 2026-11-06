# v0.1.27 — navegação por teclado nas janelas

Consolidação em 06/11/2026. [6C.2](./homologacao-etapa-6C-2.md) aprovada: 526 testes frontend, 368 backend e seis imagens sem achados no CI 42093636149.

## O que muda

- Ao abrir uma janela, o foco entra nela. Tab e Shift+Tab percorrem seus controles sem alcançar a página ao fundo; ao fechar, o foco retorna ao botão de origem quando ele ainda existe.
- Escape e o botão **Fechar janela** respeitam os mesmos bloqueios de gravação e confirmações de descarte do formulário. Durante uma gravação pendente, a janela permanece aberta.
- Atualização de follow-redirects 1.16.1 para 1.16.2 no lockfile, corrigindo o alerta identificado na auditoria. Libexpat atualizado de 2.9.0-r0 para 2.10.0-r0 nas imagens web/gateway/edge. Nenhuma mudança das permissões ou regras clínicas/financeiras.
- Confirmada a busca na Consulta por paciente fora dos primeiros 100: refinar o nome e usar **Abrir** permite acessar o registro. A limitação da página não representa perda de cadastros.

## Instalar ou atualizar

Seguir o [roteiro Windows](./INSTALACAO-CLINICA-WINDOWS.md) para instalação nova ou o [roteiro de atualização](./ATUALIZACAO-SERVIDOR-WINDOWS.md) para instalação existente, usando a tag aprovada `piloto-cadastros-v0.1.27`.

Partindo da v0.1.26: sem nova migração, configuração, porta ou conta. A revisão permanece `0026_clinical_records`; preservar projeto, configuração, certificados e volumes. Fazer backup completo, retirar usuários, atualizar conforme o roteiro e recarregar as abas. Nas estações continua sendo necessário apenas o navegador.

Partindo da v0.1.24 ou anterior: observar também as [notas da migração 0026](./ATUALIZACAO-PRONTUARIO-V25.md). Não executar downgrade ou restaurar backup antigo sobre dados novos.

Na conferência, abrir/fechar um cadastro, testar Tab/Shift+Tab e confirmar que dados anteriores continuam acessíveis. O pacote mantém a liberação para cadastros após o checklist físico; não libera automaticamente todos os módulos nem implementa odontograma.

## Evidências e limites

[6C.2](./homologacao-etapa-6C-2.md) separa testes de componentes, Chrome, HTTP e SQL. O diagnóstico de foco foi reproduzido antes da correção. Não é certificação integral de acessibilidade ou teste físico da rede da clínica.

Odontograma segue no [planejamento posterior](./PLANO-ODONTOGRAMA.md). P3 físico tem prioridade quando os dados do servidor estiverem disponíveis.
