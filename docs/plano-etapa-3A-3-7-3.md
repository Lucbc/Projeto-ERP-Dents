# 3A.3.7.3 — referências em consultas e calendário

Preparação **3A.3.7.3P concluída em 11/10/2026**, base `28ba515`. 3A.3.7.3A e 3A.3.7.3B concluídas. Complementa o [contrato de referências](./plano-etapa-3A-3-7.md). Sem alteração da aplicação nesta preparação.

## Diagnóstico específico

| Tela | Compartilhamento atual | Separação necessária |
| --- | --- | --- |
| [Lista de consultas](../apps/web/src/pages/appointments/appointments-page.tsx) | Pacientes/dentistas alimentam filtros e formulário. Procedimentos alimentam nomes na tabela, opções e duração | Referências de leitura da página separadas das opções capturadas por ação; filtros conservam valor. Nomes da tabela não dependem do formulário aberto |
| [Calendário](../apps/web/src/pages/appointments/calendar-page.tsx) | Dentistas alimentam cores dos eventos e seletor; procedimentos alimentam opções/duração | Grade e mapa de cores independentes do ciclo do formulário; navegação de data/vista e filtro de status não reiniciam o rascunho |

As três entradas do calendário são `openCreateModal` (botão), `openEditModal` (evento e recarga explícita do conflito) e `onSelectSlot` (intervalo da grade, com reset próprio). Todas deverão iniciar a mesma preparação cancelável, preservando o intervalo escolhido. A recarga explícita de consulta também inicia uma nova ação, mas sua resposta tardia não pode reabrir modal fechado ou alvo diferente.

`patientService.listAll` e `procedureService.listAll` ainda não propagam sinal; dentistas e especialidades já propagam. Não repetir a alteração já entregue. O hook compartilhado `useActionOptions` é a base para opções por ação, mas retorna `false` em falha/cancelamento. `useAvailabilityReview` desbloqueia qualquer Promise resolvida: sua integração deve **rejeitar** uma atualização malsucedida, inclusive quando o leitor retornar `false`, para não liberar revisão indevidamente.

## Prova de componente

Dois probes parametrizados, um por tela, aprovados em 4,21s com serviços simulados e dados fictícios:

1. Abrir, fechar, alterar resposta de procedimentos e reabrir mantém apenas uma leitura e duração antiga de 15 minutos.
2. Selecionar procedimento e início 10h resulta em fim 10h15; invalidar `procedures` com duração remota de 60 minutos altera o fim para 11h sem nova escolha do usuário.
3. Após digitar fim 12h manualmente, invalidar com duração de 90 minutos preserva 12h. Portanto, a reprodução demonstra mudança do fim automático; não afirma perda do fim manual.

Fonte e log preservados apenas em `.data/reference-diagnostic-3a373.test.tsx` e `.data/probe-3a373.log`, fora da suíte permanente. Não publicar testes que exijam o defeito. Não são evidências de API, banco, transporte real ou Chrome. A grade foi substituída no probe; entradas por evento/intervalo foram inspecionadas no código, ainda precisam de testes próprios e Chrome na implementação.

## Contrato de implementação

- Preparar pacientes, dentistas e procedimentos por nova ação, com permissões independentes e estados explícitos. Não liberar envio com preparação incompleta ou página parcial; erro de um recurso não deve ser apresentado como catálogo vazio nem apagar dados ainda autorizados de outro.
- Separar leitores da página dos snapshots do formulário. Sem polling de `listAll`, sem nomes/opções secretamente substituídos por invalidação/reconexão. Não buscar novamente todo o catálogo a cada render ou navegação da grade.
- Fechamento, troca de ação, suspensão, negação ou desmontagem cancelam leituras; respostas antigas não entram no próximo formulário. Concessão exige leitura nova. Perda de acesso remove também cópias não autorizadas nos filtros/grade, respeitando o acesso próprio a consultas.
- Valores selecionados ausentes continuam explícitos, com ID e indicação de ausência, sem troca pelo primeiro item. Procedimento ausente deve continuar visível e poder ser removido conscientemente da seleção. Bloquear envio até revisão dos vínculos ausentes; identificar inativos sem alterar regras do servidor.
- Duração automática responde à escolha de procedimento/início pelo usuário. Atualizar referências pode atualizar a sugestão exibida, mas deve preservar o fim já preenchido, inclusive se antes automático; aplicação da nova sugestão exige ação explícita. Editar consulta conserva datas originais e versão capturada. Fim manual continua protegido.
- Atualização comum de referências não libera conflito de disponibilidade. O botão de revisão específico exige leitura bem-sucedida de dentistas antes de desbloquear, preservando todos os campos e conflitos de versão/exclusão. Cancelamento/falha/revogação não contam como sucesso.
- Novos cliques não reiniciam rascunho em preparação. Handlers de envio verificam prontidão, permissões, conflito e operação em andamento; não depender apenas de botão desabilitado.

## Implementações ordenadas

### 3A.3.7.3A — lista de consultas e preparação compartilhada

Registrar início/aceite antes de alterar runtime. Propagar sinal nas duas paginações restantes e criar integração das três referências usando o protocolo existente. Migrar somente `AppointmentsPage`, mantendo leitores de filtro/tabela separados. Converter os probes desta tela em regressões do comportamento corrigido; cobrir falha parcial, cancelamento entre páginas, negação/concessão, ausência/inativação, duração automática/manual, reabertura, versão e revisão de disponibilidade. Incluir callbacks tardios da recarga explícita.

Aceite: testes de componente/transporte, Chrome com sessões independentes e alteração remota de duração, atualização explícita sem mover horários, 403/409 reais e regressão de disponibilidade/versão; CI/auditorias, backups, atualização somente web, HTTPS e preservação, commit/push. Regressões existentes de ambas as telas devem continuar aprovadas. API/schema não previstos.

### 3A.3.7.3B — calendário

Reutilizar preparação já validada, cobrir as três entradas, tentativa duplicada e intervalo da grade. Separar cores dos eventos e referências do formulário, integrar erro/retry e revisão de disponibilidade, preservar exclusão pendente e versão. Testar que navegação/filtros/atualização remota não substituem campos e que fechamento/desmontagem não permite reabertura tardia.

Aceite: componentes, Chrome real com botão/evento/intervalo e sessões independentes, regressões de grade/exclusão/versão/disponibilidade; ciclo de CI/auditorias/atualização/preservação/publicação equivalente ao anterior. Não considerar mock da grade como prova de interação com calendário real.

## Retomada e limites

**Próximo: implementar 3A.3.7.3A.** Não repetir diagnóstico/probes desta preparação. A última aplicação validada permanece `dbaaa00`, fechamento `28ba515`, CI `38179819243` aprovado (302 backend/302 frontend). Nenhum rebuild, reinício, migração ou teste integrado novo nesta preparação; backups e volumes intactos. Depois de 3A.3.7.3B, seguir financeiro 3A.3.7.4 e matriz R19 3A.3.7.5. Instalação assistida na etapa 5; R19 parcial.

### Retomada atual — referências da lista de consultas, 12/10/2026

**3A.3.7.3A concluída em 12/10/2026**, implementação `657407c`, complemento de testes `4b02691`: lista de consultas prepara referências por ação, separadas de filtros/tabela; preserva fim automático/manual, notas e versão, trata falha parcial/negação/ausência e cancela respostas tardias. Revisão de disponibilidade só desbloqueia após leitura bem-sucedida. [Evidências](./homologacao-etapa-3A-3-7-3A.md): CI `38198388765` aprovado (302 backend/313 frontend, HTTP/builds/auditorias), Chrome independente e regressões de disponibilidade/lista/calendário aprovados; seis imagens sem achados. Somente web da homologação atualizada, HTTPS/dez verificações/preservação aprovados, revisão 0024/zero schemas temporários. R19 parcial.

**Próximo: implementar 3A.3.7.3B — calendário**, conforme [recortes](./plano-etapa-3A-3-7-3.md). Reutilizar preparação compartilhada e cobrir botão, evento e intervalo selecionado; separar cores/grade das referências da ação, preservar duração/fim manual/versão/exclusão e revisão de disponibilidade. Registrar início/aceite e testar grade real no Chrome. Não repetir diagnóstico/probes ou testes aprovados sem mudança/falha. Financeiro em 3A.3.7.4, matriz R19 em 3A.3.7.5, instalação assistida na etapa 5.

### Retomada atual — referências do calendário, 12/10/2026

**3A.3.7.3B concluída em 12/10/2026**, implementação `bae3fb2`: calendário prepara referências por ação via botão/evento/intervalo, separa cores da grade e conserva duração, horários, rascunho e versão. Cancelamento, permissões, revisão de disponibilidade e exclusão preservados. [Evidências](./homologacao-etapa-3A-3-7-3B.md): CI `38273565070` aprovado (302 backend/324 frontend, HTTP/builds/auditorias), Chrome com grade real/sessões independentes/conflito de disponibilidade e regressão de exclusão aprovados; seis imagens sem achados. Somente web da homologação atualizada, HTTPS/dez verificações/preservação aprovados, revisão 0024/zero schemas temporários. 3A.3.7.3 concluída; R19 parcial.

**Próximo: 3A.3.7.4 — referências do financeiro**, conforme [recortes](./plano-etapa-3A-3-7.md). Inspecionar lançamento/geração, filtros e janela de consultas; delimitar subetapas antes de alterar, preservando idempotência, tentativas incertas, pagamentos e histórico. Reutilizar protocolo validado de leitura por ação/opções estáveis/atualização explícita/cancelamento/permissões independentes. Não repetir revisão geral ou testes aprovados sem mudança/falha. Matriz final R19 em 3A.3.7.5 e instalação assistida na etapa 5.
