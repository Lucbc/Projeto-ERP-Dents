# U1.8 — preservar RG durante digitação

Concluída em 19/10/2026, base `f113de0`. Versão de instalação: `piloto-cadastros-v0.1.10`; código funcional `67dd618`.

## Problema e correção

O formulário removia pontuação, convertia letras para maiúsculas e cortava o RG durante a digitação. O teste de componente reproduziu a perda de conteúdo antes da correção: 19 testes aprovados e uma falha esperada. Removida a função `normalizeRg` e seu tratamento de entrada; RG passa a usar o campo de texto sem transformação durante a digitação.

Não há imposição de formato estadual único, validação de autenticidade ou preenchimento obrigatório. A remoção de espaços nas extremidades ao salvar e a conversão de campo vazio em nulo continuam iguais. Históricos não são regravados automaticamente. API e banco já aceitam texto; nenhuma migração, dependência ou configuração alterada.

## Critérios de aceite

- Componente: preservar pontuação, letras e valor longo ao abrir, alterar e enviar.
- Chrome/API: criar e consultar RG integral, editar, preservar rascunho em conflito, recarregar e reabrir após salvar; limpar explicitamente o campo.
- PostgreSQL privado: confirmar valor integral criado e nulo após limpeza explícita.
- Build, suíte frontend e CI aprovados antes de consolidar versão de instalação.

## Evidências e retomada

Componente antes/depois: `.data/rg-components-before.log` e `.data/rg-components-after.log`; após correção, 20 testes aprovados. Build TypeScript/Vite e imagem web aprovados (`.data/rg-build.log`). Suíte frontend: 406 testes em 46 arquivos, 59,44 s (`.data/rg-frontend.log`). Chrome/API aprovado para criação, consulta, edição, conflito, reabertura e limpeza de RG. Consulta direta ao PostgreSQL confirmou o RG integral criado e a limpeza explícita do histórico (`.data/rg-browser.log`). Bootstrap, reinício e limpeza dos recursos temporários aprovados; containers principais e volumes preservados. Dados exclusivamente fictícios em recursos privados de `erp-dents-homolog`.

Código `67dd618` aprovado no [CI 39352073699](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/39352073699): 324 testes backend, 406 frontend, builds, regressões HTTP e auditorias das seis imagens sem achados. Log local `.data/rg-ci-final.log`. Aceites concluídos e guias consolidados para v0.1.10. Não repetir aceites aprovados sem mudança ou falha.

Esta alteração é exclusiva do frontend. Não modifica procedimentos de instalação/backup; tag indicada nos guias atualizada. O ensaio completo de atualização anterior está registrado na U1.7; não foi repetido nesta entrega sem mudanças de infraestrutura/API/migrações. P3 físico continua prioritário quando chegarem os dados do servidor da clínica.

Próximo recorte: reproduzir criação/edição quando a estação fica offline ou perde a resposta do salvamento. Conferir rascunho, mensagem, botão de salvar/fechar e retorno da conexão; distinguir falha antes do envio de resposta perdida após gravação para evitar orientar repetição que duplique cadastro. Leitura inicial mostra fechamento bloqueado durante `isSubmitting` e erro exibido por toast; isso ainda não comprova defeito nem substitui teste de navegador.
