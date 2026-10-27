# Etapa 4 — atendimento e prontuário

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
