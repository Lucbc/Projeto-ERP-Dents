# Etapa 4 — atendimento e prontuário

## Implementação em andamento — 27/10/2026

[4A.1A concluída](./homologacao-etapa-4A-1A.md): núcleo de domínio e 14 testes aprovados, ainda sem banco/API/telas. Próximo 4A.1B: persistência transacional, idempotência e proteção de vínculos. Não considerar o contrato 4A inteiro concluído; instalação v0.1.23 preservada.

## Decisões recebidas e contrato 4A — 27/10/2026

O usuário aprovou evolução por consulta, escrita pelo dentista, com alergias/histórico em destaque, rascunho, finalização e adendos. A leitura será **baseada em permissionamento**. Estas decisões substituem as pendências e opções históricas abaixo. Contrato definido para implementação; nenhuma funcionalidade nova entregue ainda.

### Autorização

- Recurso próprio `clinical_records`, integrado ao permissionamento existente por perfil. Não foi solicitada uma nova camada de permissões individuais por usuário.
- `view`: leitura das evoluções da clínica, inclusive de outros dentistas. Não fixar lista rígida de cargos: recepção/coordenação podem ler se receberem essa permissão explicitamente.
- `create`: iniciar evolução; `update`: editar rascunho próprio, finalizar e acrescentar adendo próprio. Escritas também exigem `view`, usuário dentista vinculado e validação de autoria no servidor. Ler não autoriza editar/finalizar pelo outro dentista.
- Sem endpoint de exclusão clínica nesta primeira entrega; `delete` não habilita remoção de evolução finalizada. A interface de permissões deve indicar a ação indisponível.
- Novas permissões negadas inicialmente nos perfis existentes, até configuração explícita. Preservar todas as permissões dos recursos atuais; configurar o novo módulo será parte do aceite e do roteiro quando liberado.
- Tratar a exceção administrativa somente no novo recurso: atualmente `can_access` e `require_permission` concedem acesso automático ao administrador. API, frontend e normalização precisam respeitar a permissão explícita do prontuário. Administrar acessos não equivale a ler conteúdo; não retirar poderes administrativos dos módulos atuais.
- Revogação deve impedir novas leituras/escritas e retirar conteúdo da interface. Testar API direta, IDs trocados, resposta atrasada e troca de identidade com os mecanismos existentes.
- Não expor evoluções por `PatientResponse` nem copiá-las para notas cadastrais/da agenda. Alergias e histórico já existentes continuam sob as permissões atuais do cadastro; esta entrega não promete ocultar esses campos antigos da recepção.

### Próximo recorte

**4A.1: persistência e autorização**, com migração aditiva e testes de domínio/API/PostgreSQL isolados. Implementar os requisitos de autoria, versão, finalização, adendo e preservação descritos abaixo antes da interface 4B. 4A só estará concluída após seus aceites; o contrato documental não é funcionalidade entregue. Instalação permanece v0.1.23.

As seções seguintes preservam o inventário e a proposta original. A indicação de perguntas pendentes é histórica e foi substituída por este contrato.

## Preparação 4P — 27/10/2026

Base `4232cf1`, instalação vigente `piloto-cadastros-v0.1.23`. Inventário estático concluído; escopo da primeira implementação e autorização de leitura pendentes de resposta da clínica. Nenhuma alteração de produto, banco ou instalação nesta preparação.

## O que existe hoje

| Área | Evidência | Limite observado |
| --- | --- | --- |
| Consulta do dentista | [Tela](../apps/web/src/pages/consultations/consultation-page.tsx), [router](../apps/api/src/api/routers/consultations_router.py), [casos de uso](../apps/api/src/core/use_cases/consultation_use_cases.py) | Próxima consulta, busca e dados cadastrais; não grava atendimento. A tela exige usuário dentista vinculado. A API permite outros perfis com permissão e dentista informado |
| Escopo do paciente | Mesmo router/casos de uso | O dentista limita a busca de consultas; lista e detalhe de pacientes não restringem o cadastro aos pacientes atendidos por ele. Não reutilizar isso como autorização automática de leitura de evoluções |
| Alergias e histórico médico | [Paciente e agenda](../apps/api/src/core/domain/entities.py), [formulário](../apps/web/src/pages/patients/patients-page.tsx), [schemas](../apps/api/src/api/schemas/schemas.py) | Textos editáveis no cadastro, retornados em `PatientResponse`; não são anamnese estruturada nem histórico imutável. A tela Consulta não os apresenta |
| Observações da consulta | `Appointment.notes` e formulário da agenda | Texto de agendamento sem autoria clínica/finalização/adendos. Não convertê-lo automaticamente em evolução |
| Estado da consulta | `AppointmentStatus` | Agendada, confirmada, concluída e cancelada; não há estado em atendimento. Concluir agendamento não prova registro clínico |
| Modelo de dados | [Modelos](../apps/api/src/adapters/db/models/models.py) e migrações existentes | Não foram encontrados modelos de evolução, odontograma, anamnese estruturada ou plano de tratamento |
| Exames | Modelo `exams` e [operação de arquivos](./operacao-exames.md) | Anexos vinculados ao paciente; exclusão/retencão de futuras referências clínicas deve ser tratada antes de vincular exames a evoluções |
| Financeiro | [Percurso aprovado](./homologacao-percurso-operacional.md) | Geração por consulta, baixa integral, histórico e estorno têm aceites próprios. Parcelamento, saldo de pagamentos parciais e plano de tratamento não são entregas desta preparação |

**Atenção ao significado das permissões:** hoje `patients.view/update` alcança também os textos de alergias/histórico do cadastro. A proposta de recepção sem acesso a novas evoluções não significa que os campos clínicos antigos já estejam segregados. Essa separação precisa constar do contrato de API/tela antes de qualquer promessa de sigilo por campo.

## Decisões enviadas à clínica

1. Primeira entrega: evolução por consulta com alergias/histórico em destaque, rascunho, finalização e adendos; ou priorizar anamnese estruturada; ou odontograma/plano de tratamento.
2. Leitura das novas evoluções: todos os dentistas, apenas responsável ou dentistas/coordenação. Recepção sem acesso às novas evoluções nas três opções.

Respostas ainda pendentes. Não assumir que o silêncio aprova a proposta. A política para administrador técnico e dados clínicos antigos também deverá ser explicitada no contrato, sem herdar acesso irrestrito apenas por ser administrador. As perguntas tratam de regras do produto que o código atual não define, não de autorização para continuar a inspeção.

## Proposta concreta se evolução por consulta for escolhida

Esta seção é proposta para revisão, não regra já aprovada ou implementada.

- Registro próprio vinculado a paciente, consulta e dentista, com autor identificado pela sessão no servidor; nunca pelo campo livre enviado pela tela.
- Rascunho com versão para impedir sobrescrita concorrente. Conteúdo não salvo permanece somente em memória, com os mesmos avisos de saída/expiração já adotados.
- Finalização explícita e atômica: texto, autoria e instante preservados; repetição da mesma tentativa não duplica o registro. Sem cobrança automática ou mudança silenciosa de status da agenda.
- Após finalização, correção por novo adendo com autor, instante e motivo, preservando o texto original. Não oferecer edição/exclusão comum de registro finalizado.
- Apresentar informação atual e informação registrada naquele atendimento com distinção clara. Não reconstruir um histórico clínico inexistente a partir de `updated_at`, notas da agenda ou cadastro atual.
- Desenhar leitura e autoria separadamente. Ter acesso para ler não concede permissão para assinar pelo outro dentista. Testar a política aprovada também na API, inclusive IDs trocados manualmente.
- Preservar vínculos e autoria diante de inativação/exclusão de usuários, dentistas, consultas e pacientes. O modelo atual tem `RESTRICT`, `CASCADE` e `SET NULL` conforme a relação; não copiar exclusões do financeiro para conteúdo clínico.
- Migração aditiva sem reescrever os campos legados; ensaio de atualização/backup/restauração isolado antes de atualizar a versão de instalação. Não converter textos antigos em registros assinados.

## Entregas e aceites após decisão

| Entrega | Critério para concluir |
| --- | --- |
| 4A — contrato e persistência | Política de leitura/autoria explícita; modelo aditivo, API, conflito de versões, finalização/adendo e proteção de vínculos comprovados por testes de domínio e PostgreSQL |
| 4B — percurso do dentista | Abrir consulta/paciente, consultar contexto, escrever/reabrir rascunho, finalizar e adicionar correção pela interface; segunda sessão confirma leitura permitida e escrita proibida; API/SQL preservam autoria/texto/versões |
| 4C — operação e preservação | Atualização e recuperação isoladas preservam cadastros/exames/financeiro e novos registros; guias atualizados; decisão explícita de ampliação do piloto separada da entrega técnica |

Se a clínica escolher outra prioridade, reescrever este recorte antes de implementar. Odontograma, assinatura documental, prescrição, exportação, política de retenção e regras financeiras ampliadas não devem ser inferidos de um simples aceite para iniciar evolução clínica. Não há declaração de conformidade clínica/legal nesta preparação.

## Validação e retomada

Inspeção de tela, rotas, casos de uso, entidades, schemas, modelos/FKs e permissões. Links locais e `git diff --check` verificados. Nenhum teste novo de API, banco ou navegador, nenhuma migração/rebuild/reinício; CI funcional anterior permanece identificado no percurso operacional. Sem nova tag: v0.1.23 continua liberada apenas para cadastros.

Próximo: registrar as respostas e fechar o contrato da primeira entrega. Até lá, não iniciar escrita de prontuário nem alterar permissões dos dados existentes. Instalação física P3 continua prioritária quando chegarem os dados do servidor.
