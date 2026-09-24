# 2B.6.4 — preparação da exclusão de pacientes e exames

Preparação concluída em 24/09/2026, base `3f9dfc7`. **Correções ainda não implementadas.** A subetapa entrega o diagnóstico e o contrato; mantém a principal na revisão `0022_dentist_user_restrict`. Referências: [plano de execução](./PLANO-DE-EXECUCAO.md), [revisão R18](./revisao-tecnica-2026-09-15.md#r18--p1--duas-pessoas-podem-sobrescrever-alterações-uma-da-outra).

## Comportamento encontrado

| Área | Comportamento atual |
| --- | --- |
| Cadastro | PUT compara/incrementa `patients.version`; DELETE não recebe versão. Repositório bloqueia o paciente, mas não compara o estado confirmado. |
| Exames | INSERT/DELETE não mudam a versão do paciente. Exames não têm endpoint de edição/substituição: cada upload cria outro UUID. Quantidade sozinha não identifica o conjunto. |
| Cascata | Excluir paciente apaga metadados de exames por FK CASCADE; intenção de limpeza é gravada na mesma transação. Arquivos são removidos após commit. |
| Consultas | FK RESTRICT impede excluir paciente em qualquer estado clínico. Falha reverte também a fila de arquivos. |
| Financeiro | FK atual vira NULL; valor, versão, capturas de origem, pagamentos e recibos permanecem. Excluir paciente não cancela dívida nem estorna pagamento. |
| Permissões | Rota de paciente exige apenas `patients.delete`; a cascata remove exames mesmo quando `exams.delete` é negado. DELETE individual exige `exams.delete`. |
| Interface | Confirmações genéricas, sem nome/efeitos; exclusão sem bloqueio durante envio nem revisão obrigatória depois de erro. Pacientes invalidam somente a lista; exames somente sua lista. |
| Manutenção | Upload, DELETE e worker compartilham advisory lock por schema. Ordem nas exclusões: armazenamento → paciente → exame/fila. Limpeza é repetível, não remove arquivo ainda referenciado e preserva trabalho pendente em falha. |
| Download | Scanner abre o arquivo e fecha; FileResponse volta a abri-lo depois. Exclusão nesse intervalo pode remover o caminho. Risco por inspeção, ainda sem reprodução controlada. |

Fontes principais: `patient_repository.py`, `exam_repository.py`, `exam_cleanup.py`, `exam_maintenance.py`, respectivos casos de uso/rotas e `patients-page.tsx`/`patient-exams-page.tsx`. `ExamUseCases.delete` faz leitura prévia e ignora o retorno booleano do repositório: deve usar o resultado transacional para distinguir ausência.

## Evidência desta preparação

Probe local `.data/probe_patient_deletion_2b64.py`, reutilizando o harness de bootstrap: schema/API/arquivos próprios e descartáveis, projeto `erp-dents-homolog`, dados fictícios, sem volumes principais. **Onze grupos aprovados, quatro diagnósticos específicos:**

1. Criar paciente v1, editar para v2, DELETE com `version=1`: hoje retorna 204 e apaga a edição.
2. Enviar exame A, excluir A, enviar B: versão do paciente e quantidade permanecem iguais. DELETE com confirmação antiga apaga B e seu arquivo. Cobrança paga conserva valor, versão, origem e pagamentos; referência atual fica nula.
3. Consulta agendada/concluída/cancelada impede excluir paciente. Exame/arquivo permanecem e nenhuma intenção de limpeza do paciente sobrevive ao rollback.
4. Perfil fictício com `patients.delete` e todas as permissões de exames negadas: DELETE individual retorna 403, mas DELETE do paciente retorna 204 e remove o arquivo.

Primeira rodada parou ao criar consulta porque o dentista fictício não tinha disponibilidade. Corrigido somente o fixture; rodada final completa aprovada. Isso é diagnóstico sequencial do comportamento atual, **não correção, teste de disputa simultânea ou aprovação da interface**. Logs/relatório locais `patient-deletion-2b64-probe*` e `last-patient-deletion-2b64-probe.json` não entram no Git.

Comparação antes/depois confirmou todas as linhas de negócio, referências históricas e bytes dos exames principais preservados. Zero schemas descartáveis ao terminar. Não houve migração, reconstrução/reinício da principal ou remoção de volumes. CI funcional vigente continua `36003711760`: 222 backend/81 frontend, HTTP e auditorias; não repetido nesta preparação documental.

## Contrato da correção 2B.6.4.1 — paciente e conjunto de exames

### Confirmação em duas etapas

- Criar `GET /api/patients/{id}/deletion-preview?version=N`, exigindo `patients.delete`. Comparar a versão apresentada, sem atualizar silenciosamente a escolha do usuário. Retornar identidade salva, versão, quantidade de exames e `exams_fingerprint` opaco; não retornar caminhos, notas clínicas ou detalhes financeiros.
- Prévia deve ler paciente e conjunto de exames consistentemente sob bloqueio do paciente, encerrando a transação antes de responder. Não reservar bloqueios durante a confirmação na tela e não adquirir lock de armazenamento depois do lock do paciente.
- Fingerprint: SHA-256 de representação canônica ordenada dos exames, vinculada ao ID do paciente, incluindo IDs e metadados persistidos que identificam cada arquivo. Ordem da consulta não pode alterar o resultado. Definir/testar serialização de UUID, datas e nulos; conjunto vazio também tem fingerprint. Não usar somente contagem/data máxima/nome do arquivo.
- Fingerprint é precondição de estado, **não autorização nem segredo de acesso**. Não é necessário criar sessão de confirmação, expiração ou migração para esta solução. Não substitui as permissões atuais. O contrato cobre operações suportadas pela aplicação; SQL administrativo que reescreva arquivos/metadados exige procedimento de manutenção próprio.
- DELETE exige `version` positiva e `exams_fingerprint` no formato esperado. Sob lock de armazenamento e depois do paciente, reler estado atualizado, conferir permissões/precondições e só então enfileirar arquivos e excluir. Prévia nunca autoriza excluir um conjunto diferente.
- 422 para parâmetros ausentes/inválidos; 404 para paciente ausente; 409 `stale_version` para cadastro alterado; 409 `stale_exams` para conjunto diferente; 409 `linked_record` para FK impeditiva. 503 de armazenamento ocupado continua recuperável mediante revisão, sem reenvio automático. Falhas fazem rollback inclusive da fila.
- Envio/exclusão de exames deve adquirir o bloqueio do paciente antes da escrita, inclusive em chamadas diretas ao repositório. Manter ordem consistente. Upload que perde o paciente falha sem metadado órfão; compensação nunca apaga arquivo de commit ambíguo que ainda esteja referenciado.

### Permissão da cascata

**Correção explícita de autorização:** com exames presentes, tanto prévia quanto DELETE exigem também `exams.delete`. Sem essa permissão, retornar 403 sem divulgar metadados de exames nem realizar limpeza. Paciente sem exames continua exigindo apenas `patients.delete`; não acrescentar permissão financeira. Reavaliar o conjunto e a permissão no DELETE, inclusive se um upload ocorrer depois de uma prévia vazia. Não mudar perfis/padrões automaticamente.

Essa regra fecha a exclusão indireta de um recurso cuja exclusão direta é proibida; mantém a cascata existente para operadores autorizados. Não converte exclusão em inativação nem decide políticas de retenção clínica. A adequação dessas políticas à clínica continua em recorte próprio.

### Interface

- Selecionar ID/versão da linha salva; buscar prévia; mostrar nome do paciente e quantidade exata de exames a remover. Avisar que os arquivos serão removidos e cobranças/pagamentos permanecem. Modal separado do rascunho de edição.
- Bloquear envios duplicados. Após 404/409/403/503, rede ou 5xx, preservar rascunho e exigir ação explícita de recarga e nova confirmação. Recarga falha não desbloqueia exclusão. Resultado incerto não vira sucesso nem tentativa automática.
- Sucesso invalida pacientes, paciente individual, exames do paciente, agenda/consultas e referências financeiras. Upload/exclusão individual invalida qualquer prévia de exclusão local; outras abas são protegidas pela comparação no servidor.
- Nunca fazer prévia automática seguida de DELETE sem nova confirmação: isso aceitaria exames que o usuário não confirmou. Abas antigas sem precondições recebem 422; entregar API/web e adaptar smokes juntos.

### Banco, arquivo e dinheiro

- Preservar fila transacional, unicidade, ausência de FK da fila para paciente excluído, processamento após commit e retry. Sucesso de DELETE significa cadastro removido com limpeza durável programada; não prometer remoção física instantânea quando o disco falha.
- Arquivos ainda referenciados não são removidos. Falha antes do commit mantém paciente, exames, bytes e nenhuma nova tarefa; falha depois do commit mantém tarefa para outro worker. Limpeza de mais de 100 exames deve terminar posteriormente sem perder tarefas.
- Consultas em todos os estados seguem impeditivas. Histórico financeiro, estornos, pagamentos e recibos conservam-se; FK atual nula é esperada após exclusão permitida. Disputas com criação/baixa podem ter duas operações válidas conforme a ordem; não impor um único vencedor entre recursos independentes.

## Subetapa 2B.6.4.2 — exclusão individual e download

- Exam ID é imutável nas operações atuais; não inventar uma versão de edição que não existe. Remover exatamente o exame confirmado, usar retorno transacional para 404, distinguir disputa/erro e manter a mesma ordem de locks/fila. Exclusão individual muda o fingerprint do conjunto do paciente.
- Confirmação identifica paciente e arquivo salvo; bloquear duplicidade e exigir recarga/nova confirmação em falha. Preservar formulário de upload; fechar/revogar prévia local do arquivo removido e invalidar requisições de prévia ainda em voo.
- Reproduzir download × limpeza antes de escolher implementação. Critério: resposta íntegra do arquivo já aberto ou erro controlado antes de iniciar a resposta; nunca 500 por reabertura de caminho removido, arquivo parcial tratado como completo ou bypass do scanner. Fechar descritor em sucesso, erro e desconexão; não manter lock global durante transferência lenta.
- Não ampliar para edição de notas, substituição de arquivos, prontuário completo ou mecanismo de retenção nesta entrega.

## Matriz de aceite da implementação

| Camada | Evidência obrigatória |
| --- | --- |
| Fingerprint/prévia | Estável sob ordenação, vazio, nulos/datas, troca com mesma contagem, metadados diferentes; leitura coerente e sem lock retido após resposta |
| Banco | PUT × DELETE, dois DELETEs, upload × DELETE, exame DELETE × paciente DELETE; barreiras em conexões distintas, estado final e rollback verificados |
| Fila/arquivos | Commit recusado, commit ambíguo, disco indisponível, retry em outra sessão, arquivo referenciado, lote acima do limite; conferir bytes e tarefas |
| Permissões/API | 422/404/409/403/503, revogação, paciente vazio sem permissão de exames, paciente com exames exige ambas; nenhuma exposição de detalhes negados |
| Consultas/financeiro | Quatro estados clínicos; criação/reagendamento × exclusão; pendente/pago/estornado, geração/baixa, origem e recibos intactos |
| Componentes | Prévia falha, cadastro/conjunto alterado, rede/5xx, recarga falha, nova confirmação, rascunho, bloqueio duplo, invalidações e permissões |
| Chrome | Duas abas: edição, upload/troca com mesma quantidade após confirmação, rejeição, recarga e nova confirmação; negação de cascata e fluxo autorizado |
| Download (2B.6.4.2) | Exclusão antes/depois de abrir arquivo, scanner, transferência interrompida e descritores liberados; bytes completos ou erro controlado |
| Entrega | Cópias antes de atualizar principal, API/web juntos, preservação, smokes adaptados, regressão/CI, commit/push e HEAD remoto |

## Próximo passo exato

Implementar **2B.6.4.1**, começando pelos testes de prévia/fingerprint e bloqueios em banco isolado; manter 2B.6.4.2 separado para a interface individual/download. Adaptar portas, casos de uso, rotas, schemas, services, tipos, tela e todos os callers de DELETE paciente (inclusive limpezas construídas por variável). Não adicionar teste permanente que espere o defeito diagnosticado. Não repetir a revisão geral nem reabrir catálogos/consultas/dentistas concluídos.
