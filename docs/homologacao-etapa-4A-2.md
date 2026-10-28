# 4A.2 — API e permissões do prontuário

## Escopo e estado

Concluída em 28/10/2026, base `a9325a3`, código `c9a0769`. A instalação continua em `piloto-cadastros-v0.1.24`, branch de manutenção sem migração 0026. Esta entrega pertence à main de desenvolvimento.

## Comportamento implementado

- Recurso `clinical_records` negado inicialmente para todos os perfis. Administrador configura sua leitura explicitamente e mantém os demais acessos administrativos; não pode escrever como dentista.
- Tela Permissões permite configurar leitura por perfil. Criar/editar exigem leitura e perfil dentista; excluir nunca é permitido. A API verifica também usuário ativo, sessão, vínculo e autoria dentro da transação.
- No perfil administrador, PUT de permissões aceita somente `clinical_records`; versão obrigatória impede sobrescrever uma alteração concorrente. Campos dos outros recursos permanecem protegidos.
- Rotas próprias, sem incluir evoluções em respostas de pacientes ou observações de agenda. Não há rota de exclusão clínica.
- A lista exige `patient_id`, usa `limit` de 1 a 100 (padrão 20), `offset` não negativo e ordenação decrescente de criação/ID. Retorna `items` e `total` após autorização.
- Texto limitado a 50.000 caracteres e motivo de adendo a 5.000. Campos extras, autoria, contexto e horários fornecidos pelo cliente são rejeitados. Rascunho pode ser vazio; finalização e adendo exigem texto não branco.
- Identificador `key` UUID por tentativa; salvamento/finalização/adendo exigem versão inteira positiva. Repetição exata recupera a resposta original, mesmo após adendos; reutilização com conteúdo diferente retorna conflito. Revogação bloqueia também recuperação de recibos.
- Finalização captura alergias/histórico do cadastro no servidor. Campos legados continuam acessíveis conforme permissões de pacientes. O novo recurso não altera essa regra.
- Respostas de gravação, recuperação e leitura usam UTC com precisão preservada. A leitura anterior podia representar o mesmo instante com outro offset do PostgreSQL; o aceite HTTP detectou e orientou a normalização.
- Restrições existentes impedem excluir/reassociar consulta com registro clínico; a fronteira de erros devolve 409 sem detalhes SQL. Operação rejeitada preserva consulta e evolução.

## Rotas

| Método | Caminho sob `/api/clinical-records` | Corpo |
| --- | --- | --- |
| GET | `?patient_id=UUID&limit=20&offset=0` | — |
| GET | `/{id}` | — |
| POST | `/from-appointment/{appointment_id}` | `key`, `text` |
| PUT | `/{id}` | `key`, `version`, `text` |
| POST | `/{id}/finalize` | `key`, `version` |
| POST | `/{id}/addenda` | `key`, `version`, `text`, `reason` |

## Evidências e pendências

- 32 testes clínicos locais aprovados: 14 de domínio, 14 PostgreSQL e 4 de contrato/schema/permissão. A normalização UTC posterior foi exercitada no HTTP e na regressão integral do CI.
- 21 testes de permissões PostgreSQL aprovados (leitura sem gravação, versões, concorrência, revogação e rollback).
- 499 testes frontend e TypeScript/build aprovados. Incluem acesso clínico explícito nos quatro perfis, revogação e controles da tela de permissões. Build mantém aviso conhecido de tamanho do bundle.
- Aceite HTTP/SQL privado aprovado, incluindo leitura por coordenador/recepção/outro dentista, proibição de escrita por terceiros, finalização vazia rejeitada, paginação, revogação, conflitos e preservação. `.data/clinical-api-http.log`.
- Chrome real sobre TLS aprovado: concessão/revogação de leitura admin, criação/edição clínica do dentista persistidas após recarga, controles indisponíveis bloqueados; regressão de duas abas/versões e sessão revogada aprovada. SQL confirma matriz salva pela interface. `.data/clinical-permissions-browser.log`.
- [CI 40706119671](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/40706119671) aprovado no código `c9a0769`: 499 frontend, 368 backend em 785,570 segundos, builds e regressões HTTP, incluindo o novo harness clínico. Auditorias de pacotes aprovadas e seis imagens sem achados (`api`, `web`, `gateway`, `edge`, `db`, `clamav`: `{}`). Base de vulnerabilidades atualizada em 28/10/2026 às 13:01:10 UTC. Log local: `.data/clinical-api-ci.log`.
- O harness clínico dispensa a exclusão artificial de todos os usuários ao final do teste de bootstrap, pois as FKs clínicas preservam o autor. O teste independente de bootstrap continua executando essa exclusão; o schema privado inteiro é descartado pelo harness após os testes, sem remover volumes.

## Próximo passo

4B: interface de atendimento com contexto, leitura, rascunho, finalização e adendos. Não considerar esta API como prontuário já disponível ao usuário final. Atualização/recuperação do conjunto clínico permanece em 4C antes de ampliar a versão de instalação. P3 físico continua prioritário quando chegarem os dados do servidor. Guias de instalação permanecem corretos para v0.1.24; não houve reinício dos containers principais ou remoção de volumes locais.

### Integração 4B mapeada durante o CI

- `consultation-page.tsx` já carrega paciente e próxima consulta; apresentar alergias/histórico e entrada para atendimento nesse ponto. `upcoming_appointments` já existe na resposta da API, mas a tela mostra apenas a próxima; a escolha explícita da consulta evita registrar na consulta errada. Considerar consultas passadas ao reabrir rascunhos.
- `App.tsx` e `ConsultationPage` restringem a página atual ao perfil dentista. O leitor com permissão clínica precisa de uma entrada própria, sem depender dessa restrição. Não remover indiscriminadamente as proteções do módulo Consulta.
- Criar tipos e serviço clínico separados em `types`/`services`; não adicionar evolução ao DTO de paciente. Planejar identificação/busca do paciente respeitando separadamente permissões clínicas e cadastrais.
- Usar as barreiras existentes de permissões/sessão e consultas sem retenção após revogação. Preservar rascunho durante falha transitória/conflito, mas ocultar conteúdo e limpar cache em perda de acesso ou troca de usuário.
- Manter `key` e corpo da tentativa até resolver resultado desconhecido; repetição recupera a versão capturada e não deve sobrescrever na tela um estado mais novo. Não finalizar texto ainda não salvo nem tratar agendamento concluído como evolução finalizada.
- Aceite 4B precisa de Chrome com autor e leitor independentes, conflito entre duas abas, resposta perdida, revogação, recarga e conferência SQL de texto/autoria/versão. API aprovada nesta etapa não substitui esse percurso.
