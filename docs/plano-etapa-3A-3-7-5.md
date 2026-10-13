# 3A.3.7.5 — matriz final R19 e requisições

## Preparação 3A.3.7.5P — 13/10/2026

Base documental `d95b465`, árvore inicialmente limpa. Inspeção estática de leitores, isolamento de sessão, testes e relatórios existentes; nenhuma alteração funcional. Aceite desta preparação: inventário rastreável, distinção entre evidência existente e prova pendente, recortes com critérios mensuráveis e ponto de retomada. **R19 permanece parcial.**

## Matriz dos leitores operacionais

Todos os leitores abaixo usam [useLiveQuery](../apps/web/src/hooks/use-live-query.ts): intervalo normal de 15s, 60s após falha, pausa oculto/offline/suspenso e atualização no retorno. Esses intervalos são política do cliente, não garantia de latência. Leituras dependem da montagem e da autorização; não equivalem a polling de todos os módulos.

| Área | Leitura e limite identificado no cliente | Evidência existente a reutilizar |
| --- | --- | --- |
| Permissão efetiva | `permissions/me/usuário`, um provider por sessão, independente dos consumidores; descarte ao desmontar | [Fundação](./homologacao-etapa-3A-3-1-1.md), [integração](./homologacao-etapa-3A-3-1-2.md); `effective-permissions.test.tsx`, `permission-integration.test.tsx` |
| Painel | Totais de pacientes/dentistas com `limit: 1`; consultas do dia local; permissões independentes dos indicadores | Regressões de painel na [integração](./homologacao-etapa-3A-3-1-2.md); `dashboard-refresh.test.tsx` |
| Consulta clínica | Próxima consulta, busca de pacientes até 100, detalhe do paciente selecionado; escopo clínico próprio; 404 interrompe detalhe até revisão | Regressão clínica na [integração](./homologacao-etapa-3A-3-1-2.md); `consultation-refresh.test.tsx` |
| Lista de consultas e calendário | Consultas segundo filtros/intervalo; chaves próprias de cada tela | [Lista](./homologacao-etapa-3A-3-7-3A.md), [calendário](./homologacao-etapa-3A-3-7-3B.md); script `smoke_agenda_refresh_browser_homolog.cjs` |
| Pacientes | Busca, primeira página de 100; ausência na lista não prova exclusão | [Pacientes](./homologacao-etapa-3A-3-3.md); `patient-refresh.test.tsx` |
| Procedimentos e especialidades | Busca, primeira página de 100 por recurso | [Catálogos](./homologacao-etapa-3A-3-4-1.md); `catalog-refresh.test.tsx` |
| Dentistas | Busca, primeira página de 100; edição/horários têm versão capturada | [Dentistas](./homologacao-etapa-3A-3-4-2.md); `dentist-refresh.test.tsx` |
| Usuários | Busca, primeira página de 100; senhas fora da lista/cache | [Usuários](./homologacao-etapa-3A-3-5-1.md); `user-refresh.test.tsx` |
| Matrizes administrativas | `permissions/roles`, distinto da permissão efetiva; negação remove somente a matriz administrativa | [Matrizes](./homologacao-etapa-3A-3-5-2.md); `permission-live.test.tsx` |
| Financeiro | Lista filtrada até 200 e resumo em chaves separadas; histórico por lançamento quando diálogo montado | [Lista/resumo](./homologacao-etapa-3A-3-2-1.md), [histórico](./homologacao-etapa-3A-3-2-2.md); `financial-refresh.test.tsx`, `financial-history-refresh.test.tsx` |
| Exames | Lista por paciente e cabeçalho do paciente separados; permissões independentes | [Isolamento](./homologacao-etapa-3A-3-6-1.md), [atualização](./homologacao-etapa-3A-3-6-2.md); `exam-live.test.tsx` |

O inventário não estabelece limite máximo de resposta dos endpoints de agenda, histórico ou exames: conferir contrato do servidor se uma medição exigir essa informação. Contagem de chamadas não mede bytes, custo SQL ou capacidade simultânea.

## Referências e leituras sem polling

| Consumidor | Ciclo e limite | Evidência |
| --- | --- | --- |
| Usuário → dentista | Nova ação/atualização explícita; opções estáveis; `listAll` paginado | [3A.3.7.1](./homologacao-etapa-3A-3-7-1.md) |
| Dentista → especialidade | Mesmo ciclo; especialidade histórica é texto, não FK | [3A.3.7.2](./homologacao-etapa-3A-3-7-2.md) |
| Consultas/calendário → paciente, dentista, procedimento | Referências da página e da ação separadas; cores da grade com leitor próprio; sem temporizador de catálogo | [3A.3.7.3A](./homologacao-etapa-3A-3-7-3A.md), [3A.3.7.3B](./homologacao-etapa-3A-3-7-3B.md) |
| Financeiro → paciente, dentista, consulta | Filtros separados da ação; consultas na janela de seis meses antes/depois da leitura; vínculo histórico pode ficar fora da janela | [3A.3.7.4A](./homologacao-etapa-3A-3-7-4A.md) |
| Geração financeira → consulta | Somente ação aberta/atualização explícita; mesma janela; tentativa incerta conserva payload/chave originais | [3A.3.7.4B](./homologacao-etapa-3A-3-7-4B.md) |
| Política de upload e bootstrap | `useQuery` direto; não são listas operacionais; não recebem polling de 15s | `patient-exams-page.tsx`, `login-page.tsx` |
| Identidade, detalhe para edição/revisão, arquivos | Leituras explícitas; identidade também na recuperação da sessão/mudança de perfil. Prévia/download não devem entrar no polling | `use-auth.tsx`, `api.ts`, handlers das páginas e relatórios acima |

Os quatro `listAll` (pacientes, dentistas, procedimentos, especialidades) percorrem páginas de 200 com cancelamento; isso não limita o total transferido. `useActionOptions` mantém snapshots locais, sem deduplicação global entre leitores independentes: duas preparações distintas podem legitimamente ler o mesmo endpoint. A medição deve separar esses ciclos de requisições duplicadas da mesma query.

## O que já foi provado e o que falta

- `live-query.test.tsx` cobre intervalo, erro/recuo, pausa/retorno, requisição lenta sem sobreposição, negação e cancelamento por filtro/desmontagem. `effective-permissions.test.tsx` cobre um leitor entre consumidores; `permission-integration.test.tsx` inclui menu/rota/formulário reais. Não repetir esses casos isolados sem mudança ou falha.
- `session.test.tsx` cobre limpeza de cache/rascunho ao trocar sessão, resposta antiga descartada, 401 atual versus antigo, expiração e sincronização entre abas. O interceptor encerra sessão no 401 autenticado; 403 comum é negação de recurso, enquanto 403 de `/auth/me` rejeita a identidade.
- Chrome já comprovou revogação real de sessão em `smoke_effective_permissions_browser_homolog.cjs` e `smoke_permission_version_browser_homolog.cjs`. Isso não é ainda uma medição única do percurso entre módulos na versão final das referências.
- **Lacuna de evidência:** contagens comparáveis, por fase e endpoint, em navegação sem recarregar o documento, incluindo leitores desmontados, retorno rápido, foco/reconexão e sessão revogada. Não foi reproduzido novo defeito funcional nesta inspeção; não apresentar hipótese de duplicação como bug confirmado.

## Recortes e critérios de aceite

### 3A.3.7.5A — medição de requisições e navegação

1. Instrumentar um ensaio Chrome privado em `erp-dents-homolog`, com fixtures fictícias e sessões independentes. Reutilizar os wrappers existentes; não usar banco/volume de outro ambiente. Registrar apenas método, caminho normalizado, fase, contagem e duração; nunca headers, corpos, identificadores pessoais ou credenciais.
2. Percurso pelo menu, sem `goto` a cada módulo: painel → pacientes → consultas → calendário → financeiro → painel. Esperar estabilização inicial e medir ao menos dois intervalos normais por tela; classificar permissão global, listas/resumos e referências separadamente.
3. Aceite: um leitor global de permissões permanece; nenhum novo GET periódico da tela abandonada depois de estabilizada a navegação; referências não repetem por passagem do tempo; geração fechada não adiciona leitor. Contar separadamente leituras iniciais, retorno, atualização explícita e ciclos periódicos.
4. Pausar visibilidade/offline, aguardar término/cancelamento das requisições anteriores e verificar ausência de novas leituras periódicas. Retornar e confirmar dados remotos sem escrita automática. Medir foco/visibilidade próximos e requisição lenta: não sobrepor a mesma query; não impor uma contagem global irreal a chaves distintas.
5. Registrar tabela de observado/esperado e duração por fase. Se aparecer falha, reproduzir em componente/transporte e corrigir em subetapa identificada antes de prosseguir; nenhum ajuste preventivo sem evidência. Testes novos devem verificar comportamento, não detalhes da implementação.

### 3A.3.7.5B — sessão no percurso e fechamento da matriz

1. Complementar o percurso com revogação real da sessão em outra sessão autorizada; verificar 401, retorno ao login, descarte de dados/rascunhos e ausência de novas leituras privadas periódicas após estabilização. Resposta atrasada da sessão antiga não pode reaparecer após novo login.
2. Verificar nova sessão com outro perfil, menu/rota e referências autorizadas, sem reaproveitar cache da identidade anterior. Distinguir 403 de recurso de encerramento global e reutilizar as provas anteriores onde bastarem.
3. Consolidar evidências por componente, API, banco e Chrome. Conferir limpeza dos schemas privados. Se houver mudança funcional, executar regressões pertinentes/CI/auditorias e atualizar homologação com backups/preservação/HTTPS conforme contrato; se somente testes/documentação, justificar o conjunto de validações sem reconstruir aplicação inalterada.
4. Encerrar R19 somente após A/B aprovados e limitações registradas: atualização periódica, opções deliberadamente estáveis, listas limitadas, janela financeira, Chrome no mesmo PC sem prova de capacidade/estações físicas. Instalação assistida continua na etapa 5.

## Retomada

**Preparação concluída; próximo: 3A.3.7.5A.** Registrar início antes de implementar o ensaio. Nesta preparação houve somente inspeção estática e revisão documental: nenhum teste novo de componente, API, banco ou Chrome; nenhum rebuild, reinício, migração ou backup. A última validação funcional continua sendo [3A.3.7.4B](./homologacao-etapa-3A-3-7-4B.md), CI `38400536916` aprovado, 302 backend/339 frontend. Não repetir a revisão geral nem testes já aprovados sem mudança/falha.
