# 2B.8 — concorrência administrativa em usuários e permissões

Preparação concluída em 26/09/2026, base `7fcd0bd`. **Diagnóstico e contrato; nenhuma correção funcional nesta preparação.** Preservar as proteções da 1C: último administrador ativo, limites de delegação, autorização atual e revogação de sessões.

## Evidências de banco e casos de uso

Probe local `.data/probe_admin_2b8.py`, container descartável da homologação, schema `test_agenda_*` próprio migrado até head e dados fictícios. Usa conexões independentes e intercalações controladas nos pontos de leitura/autorização/escrita; lê o resultado em nova sessão. Uma execução em 4,071s reuniu seis diagnósticos:

| Cenário | Resultado reproduzido |
| --- | --- |
| Formulário de usuário antigo após edição/inativação | Restaura nome e estado ativo anteriores. Sessões já revogadas continuam revogadas; não afirmar recuperação da sessão antiga. |
| Confirmação antiga de exclusão após edição do usuário | Exclui o registro alterado sem exigir revisão. |
| Matriz antiga do perfil após revogação | Restaura a permissão retirada. |
| Normalização durante leitura de uma matriz parcial | Depois de outra conexão confirmar a revogação, grava a matriz calculada antes dela e restaura a permissão. |
| Revogação de permissão após autorização de escrita de usuário | A revogação confirma em outra conexão; a escrita do usuário ainda confirma. O lock de usuários não coordena a alteração da matriz. |
| Administrador inativado após dependência resolvida | Composição da dependência `require_admin` e caso de uso de permissões ainda permite gravar. O caso de uso não recebe/revalida o autor. |

Os dois últimos são diagnósticos controlados de dependência/caso de uso/banco, **não duas requisições HTTP simultâneas**. Não são ensaio de carga. Não adicionar testes permanentes que esperem estes defeitos.

### Confirmação por HTTP

Probe `.data/probe_admin_http_2b8.py`, API/schema descartáveis com dados fictícios, confirmou também os três primeiros cenários por requisições autenticadas: PUT antigo restaura ativação/nome; DELETE sem versão remove usuário editado após a confirmação antiga; PUT de matriz antiga restaura permissão retirada. A sessão anterior do usuário reativado permaneceu revogada (401). Três diagnósticos e dez grupos no harness, incluindo bootstrap/reinício/limpeza. Não houve Chrome novo nem corrida de requisições nesses três casos sequenciais.

## Inspeção da aplicação

- `UserUseCases._authorize` adquire `administration_lock`, descarta identidades ORM antigas e relê ator/permissões. `LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE` mantém último administrador e serializa escritas, mas não identifica que o cliente enviou um formulário antigo. Preservar esse protocolo até haver alternativa comprovada.
- Usuários, redefinição administrativa de senha e DELETE não recebem versão. A interface de edição envia nome/e-mail/perfil/vínculo/status completos; exclusão confirma texto genérico e usa apenas ID. Não há recuperação específica de conflito.
- `RolePermissionRepository.upsert` substitui o JSON sem versão. `PermissionUseCases.get_for_role` e `require_permission` normalizam e gravam durante leitura quando falta a linha ou a matriz está incompleta.
- PUT de permissões usa `require_admin` antes da escrita, sem rechecagem transacional do autor. A interface envia uma matriz completa por perfil. `useEffect` reconstitui todos os rascunhos quando a consulta é atualizada; salvar um perfil pode descartar rascunho de outro. Este último é achado por inspeção, ainda sem reprodução em navegador.
- Não houve nova homologação Chrome nesta preparação. Não confundir diagnóstico da API com validação visual.

## Ordem das correções

### 2B.8.1 — leituras de permissões sem gravação

Primeiro recorte, independente de migração/versionamento:

- Remover persistência implícita de `get_for_role` e `require_permission`; normalizar somente a representação efetiva devolvida/usada na autorização. Não mudar permissões padrão nem a imutabilidade do perfil administrador.
- GET de `/permissions`, `/permissions/me` e verificação de acesso não devem inserir/atualizar matrizes ou confirmar transações. Linha ausente usa os mesmos padrões atuais; JSON parcial permanece intacto no banco até alteração explícita.
- Testar matriz ausente/parcial/canônica, leituras simultâneas sem criação duplicada, revogação intercalada com leitura e preservação exata do JSON. Verificar que a chamada seguinte observa a revogação, sem uma leitura anterior a desfazer.
- Exercitar HTTP autenticado/permissões e regressão da 1C; nenhuma mudança visual é esperada. Não apresentar esse recorte como proteção de formulários antigos ou solução de todas as janelas de autorização.

### 2B.8.2 — escrita versionada de permissões e coordenação da autorização

- Versão por perfil editável, pré-condição obrigatória no PUT, comparação/incremento na mesma transação; retorno 409 `stale_version` sem matriz sensível para quem perdeu acesso. Tratar primeiro cadastro/linha ausente e padrões sem gravação em GET. Definir migração preservando JSON existente e defaults antes de implementar.
- Escritas de permissões devem participar do protocolo de administração de usuários: revalidar ator ativo e administrador sob coordenação, reler ORM e manter lock até commit/rollback. Não autorizar somente com objeto retornado pela dependência antes da espera.
- Definir a ordem de locks e o ponto de autorização em relação a inativação, rebaixamento, exclusão, redefinição de senha e revogação de sessão. Verificar o contexto de sessão passado pelas dependências e não prometer interrupção retroativa de operações já confirmadas. Reproduzir as duas ordens antes de escolher a solução final.
- Revogação confirmada antes da autorização transacional deve impedir a escrita subsequente; operações compatíveis devem continuar possíveis. Preservar administração exclusiva de permissões, delegação de usuários e último administrador ativo.
- Rascunho/versão independentes por perfil na UI. Salvar um não descarta outro. Conflito e falha de recarga mantêm rascunho; descarte/recarga explícitos, sem reenviar matriz antiga automaticamente. Erro após perda de acesso não deve revelar matrizes ou dados administrativos.

### 2B.8.3 — versão do usuário e operações destrutivas

- Versão de usuário na resposta e edição; incremento atômico sob o protocolo administrativo, sem contornar rechecagem do ator. Inventariar todas as escritas: bootstrap/criação, edição, senha administrativa/própria e rehash interno. Não expor hash/senha nem permitir que um caller interno abra bypass pela API.
- Incluir redefinição administrativa de senha e exclusão com versão/identidade revisada; falha preserva usuário, sessões, vínculos e histórico. Mensagens nunca incluem segredos. Não preservar senha digitada em cache persistente, logs ou relatório; definir limpeza do campo sensível ao reabrir/encerrar o modal.
- Nome/e-mail/perfil/ativação/vínculo antigo não pode desfazer mudança confirmada; manter revogação de sessões quando exigida. Senha alterada por outro fluxo deve invalidar confirmação administrativa antiga conforme contrato a detalhar na implementação.
- Exclusão confirma identidade, requer nova leitura após conflito e preserva referência histórica financeira conforme política já existente. Não adicionar cascata clínica ou mudança automática de perfil.
- API e frontend atualizados juntos se houver novo campo obrigatório. Sem fallback que aceite silenciosamente uma escrita antiga sem versão.

## Aceite por recorte

| Camada | Evidência necessária |
| --- | --- |
| Domínio/schema | Pré-condições, defaults, normalização não destrutiva e erro controlado |
| PostgreSQL | Conexões independentes, ambas as ordens, ORM antigo, rollback, sessões e último administrador preservados |
| HTTP/autorização | Revogação, inativação/rebaixamento, perfil imutável, ausência de dados indevidos e códigos distintos |
| Interface | Rascunhos/versões por registro/perfil, recarga falhando, revisão explícita; Chrome onde houver mudança visual |
| Migração/entrega | Dados/JSON/sessões preservados, preflight quando necessário, CI, cópias e atualização sem remover volumes |

R18 continua parcial. Instalação assistida, atualização entre computadores e auditoria clínica completa seguem seus recortes próprios.

## Retomada

Próximo passo: **implementar 2B.8.1**, começando por testes permanentes do comportamento corrigido. Não repetir revisão geral nem reabrir disponibilidade de dentistas. A escolha do usuário da 2B.7 permanece definida; nenhuma nova escolha de negócio é necessária nesta preparação.

- Principal mantém **https://localhost:18443**, revisão `0022_dentist_user_restrict`; sem reconstrução/reinício/migração nesta preparação. Comparação com o checkpoint da 2B.7.2 confirmou todas as linhas de negócio/histórico e bytes dos exames preservados. Zero schemas descartáveis, nenhum volume removido.
- Último CI funcional permanece [36236034979](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/36236034979), 262 backend/106 frontend. Não repetido para documentação; não confundir esses testes da entrega anterior com os diagnósticos desta preparação.
- Probes/logs/credenciais locais ignorados pelo Git. Publicar somente contrato, revisão e ponto de retomada, com commit/push e conferência do HEAD remoto.
