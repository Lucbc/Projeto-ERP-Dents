# Homologação 3A.3.4.1 — procedimentos e especialidades

Início em 04/10/2026, base `27c3901`. [Contrato](./plano-etapa-3A-3.md). Em andamento; sem mudança de API, transação ou migração.

## Implementação

- Listas/buscas usam política 15s/60s com cancelamento Axios, pausa oculto/offline, retorno/manual e estados/timestamps. Erro inicial não vira lista vazia; falha transitória identifica última leitura. Limite 100/total explicado, sem paginação completa.
- Chaves `[recurso, list, busca]` isolam listas das referências de agenda/dentistas/formulários. Negação 401/403 desmonta conteúdo e rascunho e cancela/remove apenas listas desse recurso; permissões compartilhadas continuam aplicáveis. Não invalida referências por simples polling ou negação de uma lista.
- Nome/ativação/preço/duração e versão capturados na edição permanecem. Lista filtrada/limitada não comprova exclusão. 404/conflito de versão bloqueiam novo envio até revisão explícita; recarga falha mantém rascunho. Especialidade mantém tratamento distinto de conflito de negócio sem `stale_version`.
- Polling não libera revisão pendente de exclusão; hook versionado de exclusão permanece. Agenda e suas referências não recebem nova política; seleção e fim digitado não mudam quando outra sessão atualiza catálogo.

## Validação

| Camada | Evidência |
| --- | --- |
| Componentes/serviços | 21 testes novos para ambos os catálogos: atualização/ativação/busca/limite, rascunho/preço/duração/versão/404/409, falha/60s/manual, busca cancelada/resposta tardia, exclusão/revisão, 401/403 com caches de referências preservados, pausa/retorno/sem sobreposição, AbortSignal/Axios; integração com formulário real de agenda preserva procedimento e fim digitado |
| Frontend | **239 testes/30 arquivos em 31,00s** aprovados; TypeScript/Vite aprovados em 8,71s, aviso de bundle existente |
| Segurança/build local | npm/Python e imagem web aprovados; auditoria de imagens pendente |
| Chrome | Pendente novo harness com sessões independentes e agenda aberta; regressão de exclusão com leitor pausado para captura antiga, retorno/polling não libera revisão |
| API/banco/CI | Pendente CI completo e smoke após atualização; código API/banco não alterado |
| Preservação | Cópias públicas/exames/fingerprints/dump integral `pre-3A-3-4-1*` salvos; helper `.data/upgrade_3a341.py` |

Primeiro foco: 31/34 passaram. Três novos testes buscavam placeholder exato de especialidades na tela de procedimentos, cujo texto também menciona descrição. Seletores corrigidos; suíte completa aprovada. Não contar primeira tentativa como aceite.

## Retomada

Publicar implementação/aguardar CI; executar Chrome/capturas/regressão/auditoria de imagens. Após aceite e limpeza privada, atualizar somente web principal, verificar HTTPS/build servido/smoke e preservação (`after` do helper; não repetir `before/full`). Fictícios somente em `erp-dents-homolog`; logs/capturas ignorados e backups preservados, nenhum volume removido.

Próximo após fechamento: 3A.3.4.2, dentistas. Referências gerais permanecem em 3A.3.7; R19 parcial. Chrome no mesmo PC não demonstra capacidade/estações físicas/outros navegadores.
