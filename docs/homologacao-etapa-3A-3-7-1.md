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
- TypeScript/Vite final aprovado (8,37s); npm/Python aprovados. Aviso preexistente de bundle acima de 500kB permanece.
- Backups locais `pre-3A-3-7-1*` preservados; helper `.data/upgrade_3a371.py` somente `after`, não repetir `before/full`.

## Pendências

Construção web, Chrome novo e regressão de versões de usuários, auditoria de imagens e CI. Após aceite local, atualizar somente web de `erp-dents-homolog`, validar HTTPS/build servido, dez verificações integradas e preservação/revisão/zero schemas privados; fechar e publicar. Homologação principal ainda na etapa 3A.3.6.2. Não concluir só pelos testes de componente.

Próximo após aceite: 3A.3.7.2, especialidades no formulário de dentistas. R19 parcial; Chrome no mesmo computador não comprova capacidade/estações físicas/outros navegadores. Instalação assistida na etapa 5.
