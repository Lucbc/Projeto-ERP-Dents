# Auditoria — inventário técnico e próximo recorte

Inventário estático em 06/11/2026, durante a validação de 6D.2.2. **Não é implementação, aceite HTTP/SQL ou certificação de conformidade.** R32 continua aberto. Não altera a liberação de cadastros nem substitui o checklist físico da clínica.

## O que já existe e o que falta

| Área | Evidência no código | Limite atual |
|---|---|---|
| Pagamentos/estornos | [financial_history.py](../apps/api/src/adapters/db/repositories/financial_history.py), migração 0020 | Preserva autoria e motivo do estorno; não representa auditoria de todas as leituras/edições financeiras |
| Evoluções/adendos | [clinical_record_repository.py](../apps/api/src/adapters/db/repositories/clinical_record_repository.py), migração 0026 | Autoria e recibos de operações de escrita; `get`, `get_for_appointment` e `list_for_patient` autorizam e carregam, sem persistir evento de leitura |
| Criação de pacientes | [patient_repository.py](../apps/api/src/adapters/db/repositories/patient_repository.py), migração 0025 | Recibo por ator/chave protege repetição da criação; não é histórico geral de mudanças cadastrais |
| Edição de pacientes | [patients_router.py](../apps/api/src/api/routers/patients_router.py) | Autoriza a operação, mas o caminho de atualização não transmite o ator ao repositório para uma trilha durável |
| Usuários/permissões | [user_use_cases.py](../apps/api/src/core/use_cases/user_use_cases.py), [user_repository.py](../apps/api/src/adapters/db/repositories/user_repository.py), [role_permission_repository.py](../apps/api/src/adapters/db/repositories/role_permission_repository.py) | Ator validado e concorrência protegida; mudanças não geram histórico durável de autoria |
| Exames/download | [exams_router.py](../apps/api/src/api/routers/exams_router.py) | Permissão/antivírus e arquivo protegido; caminho de download não registra evento durável de acesso por ator |
| Erros técnicos | [error_boundary.py](../apps/api/src/api/error_boundary.py) | Registra identificador de requisição, tipo e rota; sem payload/segredo. Não é trilha de ações de usuário |

Não substituir os mecanismos existentes por um log único nem concluir que autorização ausente de histórico equivale a acesso sem permissão.

## Próximo recorte proposto — 6D.3.1

Primeira entrega: trilha de **alterações administrativas de usuários/permissões**, antes de expandir para prontuários, exames e cadastros. É um recorte pequeno com ator já disponível, útil para identificar quem concedeu acesso, inativou uma conta ou redefiniu uma senha.

Critérios a fechar no desenho e verificar na implementação:

1. Persistir identificador do evento, instante, ator, ação e identificador do alvo. Para permissões, diferença das concessões; para senha, somente ocorrência da redefinição, nunca senha/hash/token. Evitar cópias de nomes, e-mails, conteúdo clínico, corpos HTTP ou cabeçalhos.
2. Gravação da alteração e de seu evento na mesma transação: ambas persistem ou ambas são revertidas. Não colocar um middleware genérico que anuncie sucesso antes do commit.
3. Histórico não pode desaparecer ao excluir/inativar ator ou alvo; não reescrever eventos antigos. Preservar as proteções de último administrador, sessão, versão e perfil.
4. Leitura protegida por permissão específica, inicialmente negada aos operadores de cadastro; filtros/paginação e erro explícito. Política de consulta do administrador deve ser definida no desenho, sem tornar o log público.
5. Ensaios com duas sessões fictícias: sucesso gera um evento correto; 403/409 e rollback não geram evento falso de sucesso; revogação de leitura bloqueia consulta; ausência de segredos conferida no banco/saída.
6. Migração/backup/recuperação e crescimento previstos antes de liberar uma nova versão. Não inventar autoria de alterações anteriores à entrega.

Depois desse recorte: edição de pacientes e acesso clínico/download, com semântica explícita para leitura autorizada, início de transmissão e conclusão/abortamento. Não afirmar que iniciar uma resposta prova que o usuário recebeu/leu todo o documento.

Retenção, descarte, exportação e procedimentos da clínica são decisões separadas; não implementar expurgo automático, prazo legal presumido ou novos consentimentos neste recorte. Odontograma continua no [plano próprio](./PLANO-ODONTOGRAMA.md). A instalação física tem prioridade quando os dados do servidor chegarem.
