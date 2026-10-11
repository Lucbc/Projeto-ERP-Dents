# Etapa 3A.3.7.1 — referências do formulário de usuários

Em homologação em 11/10/2026, base `a635a8e`. [Contrato e recortes](./plano-etapa-3A-3-7.md). Sem alteração de API/schema.

## Implementação

- Criar/editar usuário prepara uma lista nova de dentistas, independentemente do cache. Nenhuma leitura de dentistas ao apenas consultar usuários, nem polling/reconexão das opções do formulário.
- Opções pertencem à ação; atualização explícita preserva nome, senha, associação e versão capturada. Erro/negação tem mensagem própria e bloqueia envio; concessão de leitura prepara opções novas. Dados de referência não vão ao cache global nem incluem senhas.
- Fechamento, troca de ação, suspensão ou desmontagem cancelam preparação. Resultados antigos não repovoam a ação seguinte. Paginação de dentistas transmite AbortSignal em cada página e rejeita resultado parcial após cancelamento.
- Associado ausente mantém ID e indicação explícita, bloqueando salvar até revisão; não é trocado por outra opção. Inativo é identificado, sem alterar regra de negócio do servidor. Barreira global conserva rascunho; lista de usuários mantém sua autorização própria.

## Validações

- 28 testes focados aprovados; suíte completa 295 testes/36 arquivos (33,68s). Inclui leitura a cada abertura, nenhuma leitura ociosa, reconexão/invalidação, senha preservada fora do cache, fechamento/unmount/resposta tardia, 503/403/recuperação, associado ausente/inativo, versão capturada, concessão/suspensão e transporte/paginação.
- Regressões antigas foram adaptadas para aguardar preparação antes de salvar; a expectativa antiga de leitura de referência ao montar passou a zero. Primeiro ensaio: cinco falhas nessas expectativas de timing/contagem, corrigidas sem remover provas de conflito/acesso.
- TypeScript/Vite inicial aprovado (8,37s); após complemento, 28 testes focados (5,32s) e build final (8,20s) aprovados. npm/Python aprovados. Aviso preexistente de bundle acima de 500kB permanece.
- Backups locais `pre-3A-3-7-1*` preservados; helper `.data/upgrade_3a371.py` somente `after`, não repetir `before/full`.
- Imagem web construída, seis imagens iniciais sem achados. Implementação `0f528dd` e complemento `d404f90` publicados; CI inicial `38112588826` cancelado/superado pelo final `38139079490`.
- Chrome novo aprovado com sessões independentes: leitura por ação/nenhum polling, referência remota aparece na próxima ação ou atualização explícita, rascunho/senha estáveis, falha 503 e recuperação, 403 real da referência/concessão, cancelamento e versão capturada rejeitada por 409 real. Uma escrita explícita do leitor. Capturas claro/escuro inspecionadas; fixtures privadas limpas.

## Pendências

Conferência final: teste reforçado detectou que revisão explícita aguardando usuário podia iniciar leitura de referência após desmontagem (duas chamadas, esperada uma). Corrigido com verificação de montagem e escopo atual antes de iniciar o pedido. Chrome de referências final aprovado e seis imagens finais sem achados; somente CI final `38139079490` pendente.

Regressão de versões/senhas/exclusões aprovada (`.data/browser-version-3a371.log`). Atualização inicial de somente web/HTTPS/build servido/dez verificações integradas/preservação aprovada. Imagem final também aplicada somente ao web: HTTPS/JS/CSS idênticos ao build final e linhas/referências/bytes preservados; revisão 0024/zero schemas privados. Nenhum volume removido ou demais serviços reiniciados. Concluir CI e publicar fechamento; não repetir testes locais aprovados sem mudança/falha.

Próximo após aceite: 3A.3.7.2, especialidades no formulário de dentistas. R19 parcial; Chrome no mesmo computador não comprova capacidade/estações físicas/outros navegadores. Instalação assistida na etapa 5.
