# Homologação 3A.3.4.1 — procedimentos e especialidades

Início em 04/10/2026, base `27c3901`; concluída em 05/10/2026. [Contrato](./plano-etapa-3A-3.md). Sem mudança de API, transação ou migração.

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
| Segurança/build local | npm/Python, imagem web e seis imagens sem achados aprovados |
| Chrome | Novo harness aprovado: sessões independentes, alterações de procedimento/especialidade em **14517/14701ms**, ativação/busca/rascunhos/versões preservados, 409/404 reais, criação/exclusão, falha/recuperação, pausa/revogação/403. Consulta aberta mantém seleção/fim/referências; quatro escritas explícitas, nenhuma automática. Capturas das duas telas em claro/escuro inspecionadas |
| Regressão Chrome de exclusão | Aprovada: ambos rejeitam versão antiga; retorno/polling após 17s não libera revisão, recarga/nova confirmação exclui versão revista; procedimento vinculado preservado |
| API/banco/CI | [CI 37230923350](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/37230923350) aprovado: 302 testes backend em 453,343s, 239 frontend, HTTP/builds/auditorias e seis imagens sem achados; job em 13min54s. Após atualização, dez verificações integradas aprovadas |
| Preservação | Cópias públicas/exames/fingerprints/dump integral `pre-3A-3-4-1*` preservados; helper `.data/upgrade_3a341.py after` confirmou linhas/referências/bytes antes e após atualização. Revisão `0024_user_version`, zero schemas `test_%`; nenhum volume removido |
| Publicação na homologação | Somente web de `erp-dents-homolog` recriada; HTTPS confiável retorna 200, JS/CSS servidos idênticos ao build validado |

Primeiro foco: 31/34 passaram. Três novos testes buscavam placeholder exato de especialidades na tela de procedimentos, cujo texto também menciona descrição. Seletores corrigidos; suíte completa aprovada. Não contar primeira tentativa como aceite.

## Retomada

Implementação `902444e` publicada, CI e homologação encerrados com aceite verificado. Logs locais ignorados `.data/ci-final-3a341.log`, `.data/smoke-main-3a341.log`, `.data/browser-3a341.log` e `.data/browser-deletion-3a341.log`; capturas em `.data/homolog/catalog-refresh-*.png`. Fictícios somente em `erp-dents-homolog`; sem processo privado pendente, backups preservados. Não repetir `before/full` do helper.

Próximo após fechamento: 3A.3.4.2, dentistas. Referências gerais permanecem em 3A.3.7; R19 parcial. Chrome no mesmo PC não demonstra capacidade/estações físicas/outros navegadores.
