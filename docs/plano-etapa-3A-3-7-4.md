# 3A.3.7.4 — referências do financeiro

Preparação **3A.3.7.4P concluída em 12/10/2026**, base `5541aa6`. Complementa o [contrato de referências](./plano-etapa-3A-3-7.md). Implementações 3A.3.7.4A e 3A.3.7.4B concluídas. A preparação original não alterou a aplicação.

## Inspeção e diagnóstico

Em [FinancialPage](../apps/web/src/pages/financial/financial-page.tsx):

| Leitor | Consumidores atuais | Correção necessária |
| --- | --- | --- |
| `patients/financial-form`, `dentists/financial-form` | Filtros e criação/edição manual | Separar opções da página e da ação; respeitar permissões independentes, preparar a cada abertura e permitir atualização explícita |
| `appointments/financial-generate` | Consulta vinculada no lançamento manual **e** geração automática | Preparações independentes para as duas ações; cancelar transporte e renovar janela a cada preparação |
| `financial/list`, `financial/summary` | Tabela, resumo e conferência de criação incerta | Preservar atualização operacional existente e significado distinto dos filtros do resumo |
| `financialService.get` | Revisão explícita após conflito de versão | Proteger resposta tardia por montagem/ação e passar sinal; não substituir versão capturada por atualização de referências |

A janela de consultas usa seis meses antes/depois do instante da leitura, com `Date.setMonth`; exclui canceladas das opções. Ela é carregada na montagem da página, mesmo sem abrir formulário. `appointmentService.list` já aceita AbortSignal, mas este consumidor não o passa. Pacientes/dentistas já têm paginação cancelável; reutilizar sem modificar novamente os serviços. A janela não representa todo o histórico: não classificar consulta ausente como excluída, nem remover silenciosamente seu vínculo.

`onNewEntry` e `onEditEntry` preenchem os campos, mas não renovam referências. O botão de geração apenas abre o modal. As consultas React Query alimentam diretamente os selects, sem cópia própria da ação. Pacientes/dentistas não consultam `can(resource, "view")` antes de ler; consultas consultam. O servidor continua responsável pela autorização; o diagnóstico não demonstra exposição de dados pelo backend.

## Evidência de componente

Três probes com serviços simulados e dados exclusivamente fictícios aprovados em **2,70s**:

1. Fechar/reabrir lançamento conserva nome antigo e uma única leitura; invalidar `patients` substitui o nome dentro do formulário aberto. Notas digitadas permanecem intactas.
2. Consultas são lidas antes de abrir geração; fechar pelo botão `x` e reabrir não gera leitura nova. O serviço recebe filtros sem sinal de cancelamento.
3. Sem permissão de leitura de referências, pacientes/dentistas ainda são chamados, enquanto consultas não são.

Fonte `.data/financial-reference-diagnostic-3a374.test.tsx`, log `.data/probe-3a374-final2.log`, ignorados e fora da suíte permanente. Primeira execução interrompida sem resultado; ensaio seguinte teve uma asserção prematura antes da notificação do cache. Aguardar atualização do componente corrigiu o probe; nenhuma alteração na aplicação. Não publicar testes que exijam manter o defeito.

Esses probes não validam API, banco, transporte real ou Chrome. Cancelamento, ausência do vínculo, reconexão, alteração da janela e recuperação idempotente deverão ter regressões próprias na implementação.

## Contrato que deve ser preservado

- Leitores de filtros independentes dos formulários, sem polling de catálogos completos. Capturar opções por ação; atualização operacional, foco, reconexão e invalidação não mudam opções/campos/versão. Atualização explícita de referências não descarta rascunho nem resolve conflito de versão.
- Preparação cancelável ao fechar, trocar ação, perder acesso ou desmontar, incluindo todas as páginas. Sem resultado parcial como sucesso, sem reabertura por resposta tardia, sem preparação duplicada por dois cliques. Distinguir carregamento, falha, negação, vazio e vínculo fora da lista.
- Permissões de financeiro e referências são independentes. Referências opcionais sem acesso não devem impedir um lançamento sem vínculo; não exibir cópias não autorizadas, inventar nomes ou apagar IDs capturados. Vínculo existente fora da janela/sem leitura precisa continuar explícito. Testar preservação do ID no payload; servidor decide validade. Para uma nova associação, exigir opção válida da preparação autorizada. Falha transitória de preparação permitida bloqueia novo envio até recuperação; ausência de permissão não equivale a falha transitória.
- Na geração, leitura de consultas é necessária para nova escolha. Janela deve ser recalculada por abertura/atualização explícita e informada ao usuário; não ampliar para todo o histórico nem mudar tratamento de canceladas sem decisão específica. Consulta selecionada que sai da lista exige revisão consciente, nunca seleção automática da primeira.
- Criação manual paga com resultado incerto recupera pelos mesmos dados/chave; criação manual pendente não tem esse recibo e exige conferir lançamentos antes de nova criação. Preservar essa diferença e a sinalização persistida em sessão.
- Geração usa fingerprint do ID da consulta e payload para escolher chave. Após resultado incerto, repetir as variáveis originais e a mesma chave; não reconstruir a tentativa a partir de opções atualizadas. Recuperação não pode depender de a consulta continuar na janela ou no catálogo. Nenhuma leitura dispara escrita ou repetição automática.
- Não permitir atualização de referências ou nova ação que descarte uma tentativa incerta. Pagamentos/estornos/histórico e snapshots históricos continuam independentes dos nomes atuais dos catálogos. Preservar formulário de lançamento pago como somente leitura e versão nas mutações/exclusões.

## Subetapas e aceite

| Ordem | Escopo | Evidências exigidas |
| --- | --- | --- |
| **3A.3.7.4A** | Filtros e lançamento manual: pacientes/dentistas/consulta vinculada; preparar leitor de consultas reutilizável, sem migrar ainda o modal de geração | Componentes/transporte: abertura/reabertura, estabilidade, cancelamento/paginação, falha parcial, permissões/concessão, vínculos ausentes/fora da janela, versão e revisão tardia; criação paga incerta versus pendente, preservação de chave/payload. Chrome com sessões independentes e regressões financeiras pertinentes |
| **3A.3.7.4B** | Geração por consulta: preparação própria, janela renovada, seleção e tentativas incertas | Componentes: nenhuma leitura ociosa exclusiva de geração, atualização explícita, fechamento/resposta tardia, referência cancelada/fora da janela, negação/recuperação, mesma chave/payload na repetição incerta; Chrome independente com geração real e resposta perdida/recuperação sem duplicação |

Cada implementação exige CI/auditorias e atualização somente da web de `erp-dents-homolog`, após backups, com HTTPS e comparação de dados preservados. Harnesses privados devem ser sequenciais, com fixtures fictícias e limpeza dos schemas. Separar no relatório as provas de componente, API/banco e interface. Não encerrar A/B antes dos respectivos critérios. Sem alteração planejada de API/schema/regra financeira; registrar necessidade antes de ampliar o escopo.

## Retomada

**Próximo: implementar 3A.3.7.4A.** Reutilizar `useActionOptions`, separar filtros da ação e incluir consultas no lançamento manual; não esquecer que a geração ainda consome o leitor antigo até B. Nomear os novos testes de opções de formulário sem confundir com `financial-references.test.tsx`, que testa snapshots históricos. Regressões existentes: `financial-version`, `financial-refresh`, `financial-history`, `financial-history-refresh`; selecionar scripts Chrome financeiros correspondentes às mudanças.

Aplicação/homologação permanecem na implementação `bae3fb2`, CI `38273565070` aprovado (302 backend/324 frontend). Nenhum rebuild, reinício, migração ou escrita em banco nesta preparação. R19 permanece parcial; matriz final em 3A.3.7.5 e instalação assistida na etapa 5.

### Retomada atual — lançamento manual do financeiro, 13/10/2026

**3A.3.7.4A concluída em 13/10/2026**, implementação `190592d`: filtros e lançamento manual têm referências independentes, preparação por ação/cancelamento e atualização explícita; vínculos fora da janela, rascunho e versão preservados. Referências opcionais respeitam permissões e tentativas incertas mantêm chave/payload. [Evidências](./homologacao-etapa-3A-3-7-4A.md): CI `38317724002` aprovado (302 backend/333 frontend, HTTP/builds/auditorias), Chrome independente com recuperação de criação paga sem duplicação e regressões de histórico/estorno/atualização aprovados; seis imagens sem achados. Somente web da homologação atualizada, HTTPS/dez verificações/preservação aprovados, revisão 0024/zero schemas temporários. R19 permanece parcial.

**Próximo: implementar 3A.3.7.4B — geração por consulta**, conforme [contrato e recortes](./plano-etapa-3A-3-7-4.md). Migrar leitor antigo `appointments/financial-generate` para preparação própria por ação, reutilizando `readFinancialAppointments`, sem leitura ociosa exclusiva da geração. Renovar janela por abertura/atualização explícita, preservar seleção/rascunho, cancelar respostas tardias e tratar ausência/negação. Recuperação de tentativa incerta deve usar variáveis/chave originais mesmo se consulta sair da janela; leituras nunca repetem escrita. Registrar início/aceite; não repetir revisão, backups ou testes aprovados sem mudança/falha. Matriz final R19 em 3A.3.7.5 e instalação assistida na etapa 5.

### Retomada atual — geração por consulta, 13/10/2026

**3A.3.7.4B concluída em 13/10/2026**, implementação `682e4e9`, fixture corrigida em `a49fc83`: geração por consulta prepara opções por ação, sem leitura ociosa, conserva seleção/rascunho e oferece atualização explícita/cancelamento. Tentativa incerta recupera a mesma cobrança com chave/payload originais mesmo após exclusão da consulta e perda do acesso à referência. [Evidências](./homologacao-etapa-3A-3-7-4B.md): CI `38400536916` aprovado (302 backend/339 frontend, HTTP/builds/auditorias), Chrome independente e regressão de pagamentos/estornos/histórico aprovados; seis imagens sem achados. Somente web da homologação atualizada, HTTPS/dez verificações/preservação aprovados, revisão 0024/zero schemas temporários. Referências do financeiro 3A.3.7.4 concluídas; R19 permanece parcial.

**Próximo: 3A.3.7.5 — matriz final R19 e requisições**, conforme [recortes](./plano-etapa-3A-3-7.md). Inventariar leitores operacionais/referências, permissões e limites, identificar lacunas remanescentes, medir deduplicação/pausa/retorno sem polling de catálogos completos e validar navegação entre módulos/sessão revogada. Primeiro delimitar subetapas e critérios antes de alterar; reutilizar evidências existentes e não repetir revisão geral, backups ou testes aprovados sem mudança/falha. Não encerrar R19 antes da matriz e suas limitações verificadas. Instalação assistida permanece na etapa 5.
