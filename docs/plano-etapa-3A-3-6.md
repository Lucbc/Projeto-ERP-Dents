# Etapa 3A.3.6 — exames e cabeçalho do paciente

Preparação 3A.3.6P concluída em 09/10/2026, base `6cd0030`. **3A.3.6.1 concluída; 3A.3.6.2 pendente.** Complementa o [contrato 3A.3](./plano-etapa-3A-3.md). Esta preparação delimita os recortes e reproduz problemas de identidade; não declara exames atualizados entre estações nem encerra R19.

## Diagnóstico confirmado

| Área | Evidência atual | Correção necessária |
| --- | --- | --- |
| Identidade do paciente | A rota real é `/patients/:patientId`. `PatientExamsPage` reutiliza formulário/mutação quando só o parâmetro muda. O efeito por paciente limpa prévia/exclusão, mas não notas/arquivo/progresso; upload só é abortado ao desmontar | Delimitar todo o conteúdo pela identidade do paciente; capturar paciente e geração da operação, cancelar trabalho antigo e impedir efeitos tardios sobre a nova tela |
| Upload | `onSuccess` reseta o formulário; callbacks usam o `patientId` da renderização. Não há verificação de geração como na exclusão | Sucesso/erro/progresso antigos não podem limpar formulário, mostrar avisos ou atualizar progresso do paciente novo. Invalidar somente o paciente original quando aplicável. Cancelamento não prova rollback: ao retornar, consultar a lista do paciente original |
| Cabeçalho | `patientService.get` não recebe sinal; erro cai no texto genérico `Paciente (sem CPF)`. O endpoint exige `patients.view`, separado de `exams.view` | Estados próprios de carregamento/falha/acesso negado/inexistência. Leitura autorizada de exames não pode conceder nome/CPF; 403 do cabeçalho não significa paciente excluído |
| Lista | `examService.listByPatient` não recebe sinal nem agenda atualização. Caso de uso verifica existência do paciente e responde 404 se ausente; a consulta retorna a lista completa, sem paginação | Atualizar lista com cancelamento e política 15s/60s, mantendo rascunhos e revisão. 404 da lista indica paciente ausente; lista vazia com sucesso é outro estado. Não inventar limite 100/200 |
| Prévia/download | `fetchExamBlob`, `previewImage` e `download` não recebem sinal. Prévia tem contador contra resposta antiga e libera URL ao fechar; download cria URL e aciona arquivo dentro do serviço | Cancelar bytes pendentes ao trocar identidade/perder acesso. Não criar URL, abrir prévia ou iniciar download tardio. Nova lista sem o exame deve revogar prévia já aberta e invalidar prévia pendente desse exame |
| Exclusão | Já captura paciente/geração e exige revisão após erro. Confirmação guarda nome/arquivo; não é versão de lista | Polling não pode liberar revisão, renovar confirmação nem escolher outro exame. Ausência remota do alvo deve encerrar sua confirmação e exigir nova seleção, sem excluir automaticamente |
| Permissões globais | `EffectiveAccessGate` oculta conteúdo em falha transitória, cancela queries, preserva rascunhos e remove leitores na revogação. `ProtectedRoute` protege `exams.view` e exige revisão de escrita | Preservar integração. Cancelamento de queries não cancela por si só upload/download fora do cache. Distinguir falha transitória de verificação, revogação de leitura e revogação apenas de escrita |

Fontes: [página](../apps/web/src/pages/patients/patient-exams-page.tsx), [serviços](../apps/web/src/lib/services.ts), [rotas de exames](../apps/api/src/api/routers/exams_router.py), [caso de uso](../apps/api/src/core/use_cases/exam_use_cases.py), [barreira de acesso](../apps/web/src/components/layout/effective-access-gate.tsx).

## Reprodução local desta preparação

Dois probes de componente executados com Vitest/jsdom, serviços simulados e dados exclusivamente fictícios, aprovados em 2,45s **afirmando o comportamento defeituoso atual**:

1. Navegar de paciente A para B mantendo a mesma instância da rota conserva o arquivo e as notas de A.
2. Iniciar upload em A e navegar para B não aborta seu sinal. Ao digitar notas de B e resolver o upload antigo, o callback limpa essas notas.

Isto confirma defeitos de estado da interface; **não é teste real de upload, API, banco ou navegador**. Os probes são diagnósticos locais ignorados, retirados da descoberta da suíte para não perpetuar o comportamento incorreto como contrato. Evidência local: `.data/probe-3a36.log`; fonte preservada em `.data/exam-retomada-probe.tsx`. A implementação deve criar regressões permanentes que exijam o comportamento corrigido.

## Recortes e aceites

### 3A.3.6.1 — isolamento por paciente e ciclo de vida dos arquivos

Corrigir identidade/rascunho/upload/progresso/callbacks e cancelamento de leituras/bytes antes de ativar polling. Manter prévias restritas a PNG/JPEG e downloads como anexo, inclusive conteúdo legado.

- Troca A → B → A não leva arquivo, notas, erro, progresso ou confirmação entre pacientes; nova ação começa vazia.
- Upload antigo abortado, sem reset/toast/progresso na tela nova; resposta tardia, inclusive sucesso que chegou ao servidor, não altera B. Retorno a A consulta resultado real, sem presumir rollback.
- Prévia/download pendentes cancelados e URLs liberadas ao trocar/sair; resposta tardia não cria objeto nem inicia download. Exclusão antiga não fecha confirmação nova.
- Componentes com promessas controladas e navegação na mesma instância; Chrome exercita troca de parâmetro sem recarregar documento, além de upload/download reais e regressão de exclusão. AbortSignal deve chegar ao transporte, não apenas ao mock da página.
- CI completo/auditorias, backups, atualização somente web em `erp-dents-homolog`, HTTPS/build servido/smoke/preservação e publicação. Não alterar API/schema neste recorte.

### 3A.3.6.2 — leituras remotas, cabeçalho e revogação

Sobre o isolamento validado, aplicar leitores de paciente/lista e estados independentes. Política de upload é referência de formulário: não adicionar polling universal nem substituir arquivo selecionado ao atualizá-la.

- Upload/exclusão remotos aparecem em sessões independentes, sem modificar arquivo/notas/progresso ou revisão de exclusão.
- Cabeçalho tem estados explícitos; mudança remota de nome não renova o nome capturado numa confirmação. Perda de `patients.view` esconde identidade/CPF e bloqueia exclusão dependente dessa identificação, preservando exames se `exams.view` continua autorizado. Nova concessão deve permitir uma leitura nova, sem reaproveitar identidade negada.
- 401 encerra sessão; 403 de exames oculta a área, cancela trabalho e limpa conteúdo; 403 somente do cabeçalho não é 404. Paciente realmente ausente encerra ações e prévias e não vira lista vazia.
- Prévia aberta/pedido pendente de exame removido não sobrevive à nova lista. Download já entregue ao computador não pode ser revogado pela aplicação; documentar esse limite.
- Falha transitória de dados identifica última leitura; falha de verificação global mantém a barreira existente e rascunho oculto, sem permitir interação ou downloads tardios. Recuperação não envia nada automaticamente.
- Chaves/remoção precisam ser exatas e por paciente: não remover política de upload, permissões efetivas ou listas de outro paciente por prefixo genérico. Usar `exactOnDenied` quando apropriado e delimitar estado de negação por identidade/acesso.
- Componentes: relógio/pausa/retorno/60s/sem sobreposição, 401/403/404, troca de paciente, revogação/concessão e callbacks antigos. Chrome: duas sessões independentes, bytes/prévias, latência/contagem de requisições, falhas, acesso e capturas claro/escuro. CI/HTTP/regressões/preservação/publicação próprios.

## Regressões existentes a preservar

- `apps/web/tests/exams.test.tsx`: MIME seguro, descarte de URL, tamanho, progresso/cancelamento e erro de download.
- `apps/web/tests/exam-deletion.test.tsx`: revisão de exclusão, rascunho preservado, confirmação duplicada e prévia tardia. O caso de 403 de exclusão é perda de escrita e não deve ser convertido automaticamente em perda de leitura.
- `scripts/smoke_exam_deletion_browser_homolog.py`: bytes reais, prévia, exclusão em duas abas, 404 e nova confirmação. Ao adicionar polling, adaptar sincronização sem retirar a prova de revisão: ausência observada antes da confirmação pode encerrar o alvo; forçar a janela da requisição quando o objetivo é verificar 404 real.
- `scripts/smoke_exams_homolog.py`, `scripts/smoke_exam_operations_homolog.py`, `scripts/smoke_exam_gateway_homolog.py` e exclusão de pacientes/fingerprint: backend e transporte existentes. Acrescentar casos apenas onde houver lacuna.

## Retomada

**Próximo: implementar 3A.3.6.1.** Registrar início e critérios no plano principal, escrever regressões permanentes dos dois defeitos reproduzidos e então corrigir o isolamento. Só iniciar 3A.3.6.2 após esse aceite. Nenhuma decisão de negócio exige confirmação neste momento. R19 continua parcial; referências gerais em 3A.3.7 e instalação assistida na etapa 5.

Nesta preparação não houve alteração funcional, rebuild, reinício, migração ou modificação de dados. Última homologação funcional: 3A.3.5.2, CI `37942637860`, 302 backend/269 frontend e seis imagens sem achados. Não repetir essa validação apenas por esta mudança documental.

### Retomada após isolamento — 09/10/2026

**3A.3.6.1 concluída em 09/10/2026**, implementação `8803d05`/`5d4d2c5`: exames isolados por paciente, cancelamento de upload/leituras/prévias/downloads e callbacks tardios sem apagar outro rascunho. Retorno ao paciente consulta novamente mesmo com cache recente, sem presumir rollback de upload cancelado. [Evidências](./homologacao-etapa-3A-3-6-1.md): CI `37978598105` aprovado (302 backend/276 frontend, HTTP/builds/auditorias), Chrome com navegação no mesmo documento/upload já gravado e regressões de arquivos/exclusão aprovados; seis imagens sem achados. Somente web da homologação atualizada, HTTPS/dez verificações integradas/preservação aprovados; revisão 0024/zero schemas privados.

**Próximo: implementar 3A.3.6.2 — leituras remotas, cabeçalho e revogação**, conforme [recortes de exames](./plano-etapa-3A-3-6.md). Atualizar lista/cabeçalho sem substituir arquivo/notas/revisão; manter `patients.view` distinto de `exams.view`, negar identidade sem ocultar exames ainda autorizados, tratar paciente ausente e revogar prévias/bytes quando registro/acesso desaparecer. Registrar início/aceite antes de alterar; não repetir diagnóstico/probes/testes aprovados sem mudança/falha. R19 e 3A.3.6 permanecem parciais; referências em 3A.3.7 e instalação assistida na etapa 5.
