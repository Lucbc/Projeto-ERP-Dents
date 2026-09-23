# 2B.5.3 — referências históricas do financeiro

Preparação em 22/09/2026, base `d68e864`. **Contrato para implementação; ainda não corrige o produto.** Continua a 2B.5.2.1 sem substituir seus eventos, recibos, versões ou permissões.

## Diagnóstico por inspeção

| Referência | Implementação atual | Consequência |
| --- | --- | --- |
| Paciente/dentista | `financial_repository.py` consulta nomes por JOIN com cadastros atuais; busca usa esses nomes | Renomeação muda a identificação exibida, inclusive em lançamentos pagos; nome antigo não é uma referência de busca garantida |
| Paciente/dentista/consulta | FKs financeiras em `models.py` usam `ON DELETE SET NULL` | Exclusão permitida elimina o vínculo, sem preservar identificação própria no financeiro |
| Consulta/procedimentos | Exclusão de consulta remove seus procedimentos por CASCADE; financeiro guarda IDs em JSON | IDs não preservam nomes; associação original à consulta pode desaparecer |
| Procedimentos financeiros | `_normalize_input` normaliza UUIDs; não verifica individualmente a existência dos procedimentos manuais | Pode haver ID sem cadastro mesmo antes de qualquer exclusão |
| Pagamento | `_payment` em `financial_history.py` captura valores, data, forma e autor | Evento monetário protegido, mas sem identificação histórica de paciente/dentista/consulta/procedimentos |
| Exclusões | Agenda restringe exclusão de paciente/dentista e de procedimentos associados; repositórios de dentista/procedimento apenas excluem e fazem commit | Proteção depende de haver consulta vinculada, não de haver histórico financeiro; conferir resposta HTTP dos conflitos na implementação |

Essas conclusões são de leitura do código, não de nova execução de SQL, HTTP ou Chrome. A descrição gerada pode conter nome de paciente, mas texto livre não substitui referência estruturada e não cobre criação manual.

## Contrato de captura

1. Separar **referência atual** (FK navegável) de **referência histórica** (cópia identificada e datada). Nunca usar JOIN atual como substituição silenciosa de campo histórico ausente.
2. Registrar no lançamento uma referência inicial imutável: IDs e nomes de paciente/dentista, ID e início da consulta, lista ordenada de IDs/nomes dos procedimentos, descrição financeira, instante de captura e origem. Não copiar telefone, CPF, prontuário, exames ou notas clínicas. Não apresentar preço atual de procedimento como preço originalmente cobrado.
3. Cada pagamento novo deve possuir sua própria captura, na mesma transação do evento e recibo. Capturar as referências vigentes do lançamento no momento da baixa; distinguir essa captura da origem do lançamento. Estorno aponta para o pagamento original, sem recapturar nomes.
4. Edição permitida de pendente pode mudar suas referências atuais; não reescreve origem nem pagamentos anteriores. Após estorno e correção, uma nova baixa gera outra captura. Não chamar isso de auditoria de todas as edições: histórico completo de rascunhos fica fora deste recorte.
5. Renomear, reagendar ou alterar uma consulta não sincroniza retroativamente lançamento nem pagamento. A interface deve identificar quando está mostrando origem, pagamento ou cadastro atual.
6. Criação manual e geração, pendentes ou pagas, devem usar o mesmo mecanismo transacional. Repetição idempotente retorna a captura original, sem nova consulta aos nomes para reconstituir o evento.
7. Validar novos IDs de procedimentos. Referência inválida nova deve falhar sem gravação parcial. Legado com ID ausente continua consultável, marcado como indisponível; não impedir estorno por desaparecimento de cadastro.

## Exclusão e concorrência

- Manter as restrições clínicas já existentes. Esta etapa não autoriza apagar consultas que outras regras clínicas impeçam, nem altera exclusão de exames.
- Quando a exclusão de cadastro/consulta for permitida, preservar a captura independente da FK atual. IDs históricos não devem usar FK com CASCADE/SET NULL para o cadastro original.
- Bloquear exclusão física do lançamento com pagamento, como hoje. Lançamento sem pagamento continua sujeito à versão e ao contrato atual de exclusão; não prometer trilha de um rascunho removido.
- A captura precisa ser coerente com a gravação: ler/validar referências dentro da transação que grava lançamento ou pagamento, com bloqueios de linha e ordem determinística para evitar mistura de estados concorrentes. Não basta validar no caso de uso e copiar depois de outra transação excluir/editar os cadastros.
- Definir ordem única entre lançamento, consulta, cadastros e procedimentos após inspecionar as transações de agenda. Usar testes com barreiras para criação/baixa versus renomeação/exclusão; em conflito, rollback completo e erro tratável. Não resolver deadlock com repetição indiscriminada de operação sem recibo.
- Não mudar o índice de uma cobrança ativa por consulta nem os recibos antigos de geração.

## Migração e proteção no banco

Proposta de armazenamento: tabelas próprias de captura inicial por lançamento e de captura por pagamento, com chaves únicas e payload estruturado versionado. FK para o lançamento/pagamento proprietário; referências históricas aos cadastros são valores, não vínculos apagáveis. Proteger UPDATE/DELETE das capturas de pagamento no banco, mantendo os triggers da `0020`.

Antes de escolher DDL final, testar como garantir exatamente uma captura por novo pagamento no commit e como remover a captura inicial de um rascunho cuja exclusão continua autorizada. Não adicionar uma proteção genérica que bloqueie esse DELETE legítimo.

Para registros anteriores, copiar somente o estado disponível **na migração**, com origem explícita `migration`, horário de captura e rótulo “Referência disponível na migração; pode diferir da original”. Isso também vale para pagamentos registrados antes desta nova migração, mesmo os de origem `recorded`. Não inferir nomes antigos pela descrição, autor pela sessão atual nem data histórica pelo horário de implantação. Campos sem referência recuperável permanecem ausentes, com identificação de indisponibilidade.

Não alterar valores, datas, autores, versões, hashes de operação, recibos ou eventos existentes. A captura complementar de migração não é um pagamento novo. Inventariar IDs JSON inválidos/ausentes por contagem, sem imprimir dados pessoais; documentar o tratamento e preservar o valor bruto recuperável no armazenamento histórico.

Salvar dump e cópia dos exames antes de atualizar a homologação principal; validar em schema descartável, comparar dados anteriores depois. Downgrade deve recusar descarte de capturas produzidas após implantação; não remover volumes nem desativar triggers para contornar inconsistências.

## Consulta e interface

- Consulta protegida por `financial.view`, sem endpoint de edição das capturas. Não exigir acesso ao cadastro clínico para ler a identificação mínima já autorizada no financeiro, nem expor outros campos do paciente por conveniência.
- Detalhe mostra origem do lançamento e referências em cada pagamento, com origem/data da captura e ausência explícita. Nomes atuais, se mostrados, ficam identificados separadamente. Não mudar silenciosamente o significado dos atuais campos `patient_name`/`dentist_name`.
- Busca textual deve alcançar nomes históricos preservados além dos atuais, sem duplicar lançamentos, paginação ou totais. Filtros atuais por ID continuam significando vínculo atual; eventual filtro histórico precisa ser explícito.
- Edição carrega referências atuais, nunca IDs históricos apagados como se fossem opções válidas. Não exigir recadastro fictício para abrir histórico ou estornar.
- Totais por vencimento versus caixa (R27), fuso geral (R20), parcelamento e auditoria de todos os cadastros permanecem em seus recortes.

## Matriz obrigatória de aceite

| Camada | Cenários |
| --- | --- |
| Banco/migração | Sem cadastros; cadastro existente; FK já nula; procedimento inexistente/UUID inválido; pagamento legado e registrado; preservação de colunas antigas; unicidade, imutabilidade e rollback integral |
| Repositório | Renomear paciente/dentista/procedimento; reagendar/reassociar consulta; excluir consulta e cadastros quando permitido; origem e pagamentos anteriores continuam identificáveis |
| Concorrência | Captura versus edição/exclusão em conexões independentes; falha entre captura/evento/recibo não deixa parte persistida; ordem de bloqueios compatível com agenda |
| Pagamentos | Baixa, criação paga, geração paga, estorno/correção/nova baixa; resposta perdida e reenvio antigo retornam a mesma captura e o estado atual |
| API | Permissões, contrato de campos, IDs inválidos, consulta de legado, exclusão restrita com erro compreensível, busca/paginação sem duplicação |
| Interface | Rótulos de origem/migração/indisponibilidade, histórico somente leitura, rascunho preservado, filtros e formulário sem ressuscitar vínculos apagados |
| Chrome | Duas abas, renomeação após pagamento, exclusão permitida, comparação de dois pagamentos separados por estorno/correção; evidência fictícia e limpeza |
| Entrega | Regressão, HTTP, builds, preservação, CI, relatório com limites, commit/push e HEAD remoto conferido |

## Próxima subetapa: 2B.5.3.1

Implementar banco/API/UI juntos conforme este contrato. Começar pelos testes de migração e referências em schemas exclusivos de `erp-dents-homolog`; fechar DDL e ordem de bloqueios antes de migrar. A preparação não executou novos testes funcionais e não resolveu R26. Última regressão permanece [CI 35756213438](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35756213438): 188 backend e 61 frontend. Não repetir a revisão geral nem reimplementar pagamentos/estornos.
