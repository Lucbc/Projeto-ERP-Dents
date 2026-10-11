# Etapa 3A.3.7 — referências de formulários e cobertura cruzada

**Preparação 3A.3.7P concluída em 11/10/2026**, base `3c1277e`. 3A.3.7.1 e 3A.3.7.2 concluídas; demais implementações pendentes. Complementa o [contrato 3A.3](./plano-etapa-3A-3.md); R19 continua parcial. Esta preparação não altera a aplicação ou a homologação.

## Diagnóstico e evidências

O cache global tem frescor de 15s e não atualiza ao focar a janela. Tornar um dado antigo não dispara, sozinho, nova leitura. As queries de referência ficam montadas na página; os handlers de nova ação/edição apenas resetam campos e abrem o modal. Portanto, reabrir a ação não garante dados atuais.

As opções são derivadas diretamente de `query.data`, sem cópia própria da ação. Suspender a reconexão não congela esse cache: invalidações ou uma resposta já pendente ainda podem substituí-lo. A separação das chaves de lista e formulário entregue anteriormente evita o polling direto das referências, mas não resolve estes dois casos.

Três probes de componente em `UsersPage`, com serviços simulados, dados fictícios e `staleTime: 15_000`, reproduziram:

1. Fechar e abrir novamente o formulário após 30s mantém o nome antigo do dentista; apenas uma chamada de `listAll`, apesar de o serviço já disponibilizar o nome novo.
2. Reconectar com formulário aberto substitui as opções pelo nome remoto; o texto digitado no nome do usuário permanece. Isso prova alteração das opções, não perda de todos os campos.
3. Invalidar o prefixo `dentists` substitui as opções dentro da ação aberta.

**3/3 probes aprovados ao reproduzir o comportamento atual** (2,31s). A primeira execução errou o seletor do teste (`Novo usuário` é título, botão é `Novo`); corrigido somente o probe. Não são regressões que exigem o comportamento desejado nem prova de API, banco ou Chrome. Fonte preservada em `.data/reference-diagnostic-3a37.tsx`, fora da descoberta da suíte; log `.data/probe-3a37.log`, ambos ignorados. Não publicar testes que exijam manter esses defeitos. A implementação deve convertê-los em regressões permanentes do contrato corrigido.

## Mapa dos consumidores inspecionados

| Consumidor | Referências e uso | Lacuna e integração necessária |
| --- | --- | --- |
| [Usuários](../apps/web/src/pages/users/users-page.tsx) | `dentists/users-form`; associação no formulário | Sem leitura ao abrir, sem snapshot ou estado explícito de erro da referência; reconexão/invalidação mudam opções. Manter limpeza de senhas e versões capturadas |
| [Dentistas](../apps/web/src/pages/dentists/dentists-page.tsx) | `specialties/dentists-form`; vínculos no formulário | Mesmo ciclo de cache. Manter especialidade selecionada ausente identificável; não substituir horários, versão ou revisão de disponibilidade |
| [Consultas](../apps/web/src/pages/appointments/appointments-page.tsx) | `patients`, `dentists`, `procedures` / `appointments-form`; filtros, opções e duração sugerida | Reconexão suspensa no modal; sem atualização ao abrir nem snapshot. Mudança de procedimento pode atingir duração sugerida. Revisão explícita de disponibilidade já recarrega dentistas |
| [Calendário](../apps/web/src/pages/appointments/calendar-page.tsx) | Mesmos recursos / `calendar-form`; opções, duração, mapa de dentistas/grade | Mesma lacuna; preservar grade e ações por botão, evento e intervalo selecionado. Há recarga de referências com erro e revisão de disponibilidade; integrá-las ao novo contrato |
| [Financeiro](../apps/web/src/pages/financial/financial-page.tsx) | `patients/financial-form`, `dentists/financial-form`, `appointments/financial-generate`; filtros, lançamento e geração | Filtros e ações compartilham dados; referência de consultas usa janela de seis meses antes/depois da leitura. Separar snapshots de lançamento e geração, preservar tentativas idempotentes/resultados incertos e histórico imutável |

[Serviços](../apps/web/src/lib/services.ts): quatro `listAll` usam `fetchAllPages`, páginas de 200, sem AbortSignal. Leituras individuais já aceitam sinal; propagá-lo por todas as páginas e interromper antes da próxima página. Não acrescentar polling de listas completas. Falha numa página não deve ser apresentada como lista completa bem-sucedida.

[Select](../apps/web/src/components/ui/select.tsx): opções vêm de children; o valor DOM é sincronizado quando children mudam. A implementação precisa testar registro selecionado ausente/inativo e impedir substituição silenciosa. O diagnóstico atual não demonstra todos esses efeitos no navegador.

## Contrato das correções

- Preparar cada nova ação com leitura atual, mesmo com cache recente. Estado de carregamento/erro explícito, sem apresentar cache antigo como nova leitura aprovada. Não abrir formulário utilizável antes das referências necessárias estarem prontas.
- Capturar opções da ação após sucesso; foco, polling de outras listas, reconexão e invalidação não alteram essas opções nem valores/versões/segredos/confirmacões. Filtros usam leitura separada ou snapshot próprio e conservam seu valor.
- Revisão explícita pode atualizar referências da ação, indicando ausências/inativação e exigindo escolha consciente. Não limpar campos ou trocar automaticamente pelo primeiro item. Preservar as revisões de disponibilidade e conflito já existentes.
- Cancelar preparação ao fechar, trocar alvo, perder acesso ou desmontar; ignorar respostas antigas por geração/identidade. Propagar o cancelamento até transporte/paginação. Dois cliques não criam preparações concorrentes da mesma ação.
- Falha transitória conserva rascunho sob a barreira global existente. Revogação da leitura da referência remove os dados não autorizados, sem ampliar permissões ou confundir 403 com vazio. Concessão exige leitura nova. Permissões do recurso principal e da referência são independentes; backend continua autorizando cada escrita.
- 401 mantém encerramento global da sessão. Não capturar senhas em snapshots de referência, cache ou logs. Cancelamento não presume rollback de mutações já enviadas.

## Recortes ordenados

| Ordem | Escopo | Aceite específico |
| --- | --- | --- |
| **3A.3.7.1** | Usuários e primeiro protocolo de preparação/snapshot | Leitura nova do dentista ao criar/editar, rascunho estável, falha/cancelamento/ausência/negação/concessão, senha e versão intactas. Propagar sinal no `dentistService.listAll` e infraestrutura de paginação usada; criar abstração apenas onde necessária |
| **3A.3.7.2** | Dentistas e especialidades | Adaptar protocolo validado, sinal na paginação de especialidades, vínculos ausentes explícitos; disponibilidade/horários/versões e bloqueio de consultas futuras preservados |
| **3A.3.7.3** | Consultas e calendário | Preparação conjunta paciente/dentista/procedimento, cancelamento e falha parcial; opções/duração estáveis; revisão explícita e grade/filtros separados. Inspecionar os três caminhos de abertura do calendário. Subdividir por tela se necessário antes de implementar |
| **3A.3.7.4** | Financeiro | Lançamento/geração com snapshots independentes, janela de consultas renovada na nova ação, filtros estáveis, referências ausentes/negadas; idempotência, tentativas incertas, pagamentos e histórico preservados |
| **3A.3.7.5** | Matriz final R19 e requisições | Inventariar todos os leitores operacionais/referências, permissões e limites; identificar lacunas remanescentes, medir deduplicação/pausa/retorno sem polling de `listAll`, testar navegação entre módulos e sessão revogada. Encerrar R19 somente com cobertura e limitações documentadas |

Cada implementação exige regressões de componentes e transporte pertinentes, Chrome com sessões independentes em `erp-dents-homolog`, CI/auditorias e atualização com backups/preservação/HTTPS, conforme contrato principal. Nenhuma mudança de API/schema ou regra de negócio está prevista; se surgir necessidade, registrar antes de ampliar escopo. Não repetir testes já aprovados sem mudança/falha.

## Retomada

**Próximo: implementar 3A.3.7.1.** Começar pelos três cenários acima como regressões do comportamento desejado em usuários, incluindo preparação cancelada/resposta tardia e paginação com sinal. Concluir o ciclo de componente/Chrome/CI/preservação/publicação antes de aplicar a outras telas. Nenhuma decisão do usuário bloqueia o início.

Última versão funcional validada: `3ca5a2d`, documentação `3c1277e`, CI `38109842597` (302 backend/288 frontend, HTTP/builds/auditorias; seis imagens sem achados). Esta preparação não fez rebuild, reinício, migração, escrita em banco ou nova homologação integrada. Instalação assistida permanece na etapa 5. Chrome no mesmo PC não comprova capacidade ou estações físicas.

### Início 3A.3.7.1 — 11/10/2026

Base `a635a8e`, árvore inicialmente limpa. Implementar opções próprias da ação em usuários, sem cache compartilhado ou polling; leitura ao abrir, atualização explícita, falha/negação/cancelamento e indicação de associado ausente/inativo. Propagar AbortSignal em `dentistService.listAll` e entre páginas; demais `listAll` preservados. Aceite: regressões dos três probes com comportamento corrigido, permissões/barreira, respostas tardias, páginas incompletas, senha/versão; Chrome independente e regressão de usuários, CI/auditorias/backups/somente web/HTTPS/preservação. Sem API/schema. Não concluir antes desse ciclo.

### Retomada após referências de usuários — 11/10/2026

**3A.3.7.1 concluída em 11/10/2026**, implementação `0f528dd`/`d404f90`: formulário de usuários lê dentistas a cada ação e conserva opções/rascunho/senha/versão até atualização explícita; preparação cancelável, referência ausente/negada identificada e paginação com AbortSignal. [Evidências](./homologacao-etapa-3A-3-7-1.md): CI `38139079490` aprovado (302 backend/295 frontend, HTTP/builds/auditorias), Chrome com sessões independentes e regressão de versões/senhas/exclusões aprovados; seis imagens sem achados. Somente web da homologação atualizada, HTTPS/dez verificações integradas/preservação aprovados; revisão 0024/zero schemas privados. R19 permanece parcial.

**Próximo: implementar 3A.3.7.2 — especialidades no formulário de dentistas**, conforme [recortes de referências](./plano-etapa-3A-3-7.md). Aplicar o protocolo validado de leitura por ação/opções estáveis/atualização explícita, propagando sinal na paginação de especialidades; identificar vínculos ausentes sem trocar a seleção. Preservar horários/versão/revisão de disponibilidade e bloqueio de alterações que afetem consultas futuras. Inspecionar integração e registrar início/aceite antes de alterar. Não repetir revisão geral ou testes aprovados sem mudança/falha; agenda/calendário em 3A.3.7.3, financeiro em 3A.3.7.4 e matriz final R19 em 3A.3.7.5. Instalação assistida permanece na etapa 5.

### Retomada após especialidades de dentistas — 11/10/2026

**3A.3.7.2 concluída em 11/10/2026**, implementação `dbaaa00`: formulário de dentistas prepara especialidades por ação e conserva nome histórico, horários e versão durante atualizações; erro/negação/cancelamento explícitos, paginação cancelável e protocolo compartilhado com usuários. [Evidências](./homologacao-etapa-3A-3-7-2.md): CI `38179819243` aprovado (302 backend/302 frontend, HTTP/builds/auditorias), Chrome com sessões independentes e regressões de disponibilidade/atualização aprovados; seis imagens sem achados. Somente web da homologação atualizada, HTTPS/dez verificações integradas/preservação aprovados; revisão 0024/zero schemas privados. Bloqueio de consultas futuras preservado; R19 parcial.

**Próximo: 3A.3.7.3 — referências em consultas/calendário**, conforme [recortes](./plano-etapa-3A-3-7.md). Inspecionar preparação conjunta de pacientes/dentistas/procedimentos e os três caminhos de abertura do calendário; subdividir por tela se necessário antes de implementar. Preservar duração, fim manual, versão, revisão de disponibilidade, grade e filtros. Registrar início/aceite; não repetir revisão geral ou testes aprovados sem mudança/falha. Financeiro em 3A.3.7.4, matriz final R19 em 3A.3.7.5 e instalação assistida na etapa 5.
