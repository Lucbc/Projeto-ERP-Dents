# Auditoria — inventário técnico e próximo recorte

**Publicação concluída — 10/11/2026:** `piloto-cadastros-v0.1.30` = `d13c7e29bb23de10f763a53e0ac3ee692927be93`, publicada e conferida no remoto. Verificador Git aprovou avanço do checkout limpo v0.1.29; aplicação/imagens/Compose idênticos ao produto `a296fa9` aprovado no CI. Guias alinhados à migração 0028. Instalação assistida de cadastros disponível após checklist físico. Próximo: P3 quando houver dados do servidor; enquanto aguardamos, desenhar o recorte de auditoria de leitura clínica/download antes de implementar. Não repetir 6D.3.2 sem nova falha/mudança. Odontograma posterior. Este fechamento substitui as pendências de publicação abaixo.


**10/11/2026 — 6D.3.2 concluída:** histórico de edições de pacientes com autoria, campos/versões, consulta por permissão, interface e recuperação aprovados. CI final: 552 frontend/392 backend. Publicação v0.1.30 em fechamento. R32 continua aberto para outros eventos; próximo recorte a desenhar: leitura clínica/download. Os inventários e próximos passos anteriores abaixo são históricos.


Inventário estático em 06/11/2026, durante a validação de 6D.2.2. **Não é implementação, aceite HTTP/SQL ou certificação de conformidade.** R32 continua aberto. Não altera a liberação de cadastros nem substitui o checklist físico da clínica.

## Progresso em 09/11/2026

A fundação de gravação 6D.3.1A está concluída no recorte de gravação: [contrato, evidências e limites](./homologacao-etapa-6D-3-1A.md). A linha de usuários/permissões abaixo descreve o inventário anterior; agora os caminhos administrativos autenticados gravam eventos na mesma transação. B.1 também concluída: API paginada/filtrada, permissão somente leitura, revogação concorrente e matriz de concessões homologadas em Chrome/API/SQL; [evidências](./homologacao-etapa-6D-3-1B.md). B.2 concluída: tela de histórico, filtros/paginação/permissões/cache e Chrome/API/SQL aprovados; CI final com 541 frontend e 380 backend. Migração/dump e backup operacional completo aprovados; em 09/11 o bloqueio Windows não se repetiu, sem alterações de conta/domínio ou ACL. Tag v0.1.29 publicada e comandos atualizados em 09/11; instalação física permanece pendente. R32 permanece aberto.

## Contrato de 6D.3.1B — API e tela concluídas; v0.1.29 publicada

- Recurso `administrative_audit`, somente ação `view`. Proposta coerente com a administração atual: administrador ativo pode consultar; demais perfis começam sem acesso e dependem de concessão explícita. `create/update/delete` devem ser sempre falsos para esse recurso, inclusive no normalizador e na interface; a gravação é interna às operações administrativas, não uma API de edição do histórico.
- Revalidar conta, sessão e concessão dentro da mesma proteção de concorrência usada pelas alterações administrativas, antes de ler os eventos. Testar revogação concluída enquanto uma leitura aguarda o bloqueio. A permissão de prontuário continua independente.
- Consulta com limites (padrão 25, máximo 100), ordem `occurred_at DESC, id DESC`, filtros opcionais de ação/ator/alvo/perfil e intervalo de tempo com fuso explícito. Usar cursor pela última chave retornada para evitar deslocamento de páginas por novas inserções; não prometer uma fotografia imutável entre requisições. Validar combinações, UUIDs, datas e cursor no servidor; parâmetros SQL vinculados.
- Exibir data/hora clínica, ação traduzida, IDs de ator/alvo, versões e campos/concessões alteradas. Se nomes atuais forem adicionados à apresentação, identificá-los como atuais e preservar o ID quando a conta não existir; nunca inventar nome histórico nem exigir acesso à lista completa de usuários para consultar o histórico autorizado.
- Tela somente leitura, sem exportação nesta subetapa; filtros, próxima página, recarregar, vazio/erro/carregamento explícitos. Revogação/401/403 limpa ou oculta conteúdo e cache; erro de rede não deve parecer histórico vazio. Não guardar respostas em armazenamento persistente do navegador.
- Aceites separados: normalização/componentes; PostgreSQL e concorrência; HTTP 401/403/filtros/paginação; Chrome com administrador, operador concedido e operador negado. Verificar eventos após exclusão de contas e ausência de credenciais na resposta. Banco e API não substituem o aceite visual.
- Depois da consulta, antes de nova tag: migração de base 0026 com cadastros existentes, backup/restauração dos eventos e cadastros, atualização do harness que ainda espera 0026 e guias. A correção do build zlib também precisa integrar o pacote instalável, sem antecipar a migração parcial.

## Próximo recorte — 6D.3.2

[Diagnóstico e contrato do histórico de edição de pacientes](./PLANO-AUDITORIA-PACIENTES.md), concluídos por inspeção estática em 09/11. Gravação atômica concluída, com PostgreSQL/HTTP e CI 42622060092 aprovados. Próximo B.1: consulta e permissão; B.2: tela/Chrome; recuperação antes de nova publicação. Sem mudança da instalação v0.1.29.

## Inventário anterior à implementação administrativa

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

## Recorte administrativo concluído — 6D.3.1

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
