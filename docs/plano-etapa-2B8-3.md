# 2B.8.3 — usuários, sessões e formulários antigos

Preparação em 28/09/2026, base `c039f1d`. Este documento define o contrato e os recortes; **nenhuma correção funcional ou migração foi aplicada nesta preparação**. Permissões versionadas da 2B.8.2 estão concluídas. Formulários antigos de usuários e exclusão já foram reproduzidos na preparação 2B.8; não repetir esse diagnóstico.

## Inventário verificado

| Caminho | Escrita atual | Tratamento previsto |
| --- | --- | --- |
| Bootstrap | `AuthUseCases.bootstrap_admin` → `complete_bootstrap`, bloqueio administrativo e marcador de instalação atômicos | Versão inicial 1; não exigir sessão inexistente no bootstrap; preservar ativação e bloqueio da reinicialização |
| Criação administrativa | `UserUseCases.create` → repositório `create` | Autor e sessão revalidados; versão inicial 1, sem versão de alvo no POST |
| Edição | `UserUseCases.update` → repositório `update` | Versão obrigatória e incremento, inclusive edição aceita sem diferença efetiva |
| Senha administrativa | `set_password` → `update(password_hash)` | Versão obrigatória do alvo; incrementar e revogar sessões na mesma transação |
| Senha própria | `AuthUseCases.change_password` → `update(password_hash)` | Revalidar sessão/conta ativa; conferir senha atual e versão do usuário; incrementar e revogar sessões |
| Exclusão | `UserUseCases.delete` → repositório `delete` | Versão obrigatória, comparação e exclusão atômicas; preservar último administrador e histórico |
| Login/logout | Login verifica credencial novamente sob bloqueio e cria sessão; logout revoga sob o mesmo bloqueio | Não incrementar versão de cadastro por login/logout; conservar coordenação |
| Recuperação local | `apps/api/scripts/reset_admin_password.py` lê a conta sob bloqueio e chama o repositório para trocar o hash/revogar sessões | Operação local de manutenção, sem sessão web; na 2B.8.3.2 usar versão recém-lida sob bloqueio e consumir versão. Não criar rota/bypass HTTP |
| Rehash automático | Não encontrado: `verify_password` apenas verifica bcrypt/bcrypt_sha256; não chama `verify_and_update`/`needs_update` | Não implementar rehash nesta etapa. Se introduzido futuramente, definir operação interna específica e testes; não expor bypass de versão |

As escritas de usuários em produção estão concentradas em `user_repository.py`; casos de uso de usuários/autenticação e o script local de recuperação são seus chamadores. O script foi acrescentado ao inventário na implementação da 2B.8.3.1; o levantamento inicial em `src` não o incluía. `UserResponse` hoje não tem versão e não expõe hash. `UserUpdateRequest`, `SetPasswordRequest`, `ChangePasswordRequest` e DELETE ainda não exigem versão.

Sessões são apagadas quando mudam e-mail, perfil, ativação, vínculo com dentista ou hash. Nome isolado não revoga sessões. Esses efeitos permanecem; adicionar versão não deve revogar por si só. A exclusão remove as sessões por FK CASCADE, mas não deve apagar dentistas, consultas ou eventos financeiros. Autor dos pagamentos/estornos é registrado como identidade histórica, sem FK destrutiva para usuários.

## Diagnóstico complementar

Probe local ignorado `.data/probe_user_session_2b83.py`, executado somente com a imagem `erp-dents-homolog-api`, banco `erp_dents_homolog` e schema privado migrado pelo harness existente. Uma conexão verifica sessão/identidade antes da revogação; outra conexão confirma logout/inativação; a primeira então invoca o caso de uso. Resultado confirmado em nova conexão:

- Criação, edição, senha administrativa e exclusão ainda confirmam após logout da sessão anteriormente válida, enquanto a conta continua ativa e autorizada.
- Troca da própria senha ainda confirma após logout e após inativação, desde que a senha atual seja válida. A sessão revogada permanece revogada; não houve recuperação de acesso.
- Seis cenários confirmados; schema/container privados removidos pelo harness. Nenhuma senha/hash/token foi impresso ou incluído no relatório.

São **intercalações controladas de banco/casos de uso**, não duas requisições HTTP simultâneas nem teste de carga. O probe não espera em um lock para reproduzir a dependência FastAPI: representa uma requisição já autenticada antes da autorização transacional. HTTP iniciado depois do logout já é negado pela dependência existente. Os testes permanentes devem esperar a correção, não reproduzir o defeito como resultado desejado.

## 2B.8.3.1 — revalidar sessão antes das escritas

Primeiro recorte funcional, sem migração ou mudança de payload/visual:

1. Rotas de criação, edição, senha administrativa e exclusão recebem `get_current_session_id` do cookie assinado, junto ao ator já autenticado. Casos de uso exigem `session_id`, sem default/bypass quando ausente.
2. Sob `administration_lock`, descartar cache ORM, verificar sessão pertencente ao ator e ainda válida pelo relógio atual do banco após espera, depois conta ativa/permissões atuais e proteção de administradores. Conservar bloqueio até commit/rollback.
3. Troca própria recebe a mesma identidade de sessão; revalida sessão e usuário ativo antes de verificar a senha. Manter política/limite de tentativas, revogação das sessões e saída após sucesso.
4. Logout/inativação/redefinição confirmados antes impedem a escrita posterior. Escrita confirmada antes permanece válida. Uma nova sessão legítima continua funcionando; não rejeitar mudança compatível somente porque nome foi alterado.
5. Preservar último administrador, delegação e a coordenação das matrizes de permissões já concluída. Não adicionar uma promessa de revalidação universal a todos os recursos do ERP.

**Aceite:** conexões independentes e espera comprovada no bloqueio nas duas ordens; logout, expiração durante espera, sessão de outro usuário, reset, inativação, mudança compatível, cache antigo e rollback. Cobrir as cinco operações, último administrador e delegação. HTTP autenticado valida contratos/negações, sem apresentar chamadas sequenciais como corrida HTTP. Sem Chrome novo esperado se nenhuma interface mudar. Atualizar API da homologação após cópias; CI completo/preservação/publicação.

## 2B.8.3.2 — versão e revisão explícita

Segundo recorte, API e web juntos:

- Migração proposta `0024_user_version`, a partir de `0023_permission_version`: BIGINT positivo não nulo/default 1. Preservar IDs, valores dos cadastros, hashes, timestamps, sessões e marcador de instalação. Não normalizar dados durante a migração. Validar ida/volta em schema privado e comparar dados existentes; testes antigos devem delimitar a migração que exercitam.
- Respostas de usuário/lista/me/login/bootstrap incluem versão, nunca hash. PUT e ambos os comandos de senha exigem inteiro estrito `0 < version < 2**63 - 1`; DELETE exige versão positiva em query string, com validação coerente com os DELETE versionados existentes. Ausência/inválido recebe 422. Nenhum preenchimento automático de versão no cliente de produção.
- Revalidar autor/sessão/permissão e proteção de conta administrativa antes de revelar conflito do alvo. Para payload válido, sessão encerrada recebe 401, falta de permissão 403, alvo ausente autorizado 404 e versão antiga 409 `stale_version`, sem retornar cadastro no erro. Validação estrutural do payload pode ocorrer antes do caso de uso.
- Comparar/gravar por ID+versão e incrementar na mesma transação sob protocolo administrativo. Repositório exige pré-condição, inclusive para senha própria; não usar argumentos opcionais que abram escrita sem versão. Revogação de sessões e alterações no cadastro devem confirmar ou reverter juntas. DELETE antigo não remove conta editada/redefinida depois da confirmação.
- Edição aceita sem mudança consome versão. Login/logout e leitura não consomem. Senha própria e administrativa consomem versão e invalidam formulários administrativos antigos. A senha atual continua obrigatória na troca própria; versão não substitui essa validação.

### Interface e campos sensíveis

- Edição guarda cadastro/versão originais, sem trocar versão por refetch de lista. Após conflito/falha de resultado incerto, conservar somente rascunho não sensível e bloquear novo envio até revisão explícita. Recarga falhando mantém bloqueio; sucesso recarrega usuário e referências necessárias, sem salvar automaticamente.
- Adicionar `userService.get`. Não conceder leitura implicitamente a quem tem só permissão de escrita: se a recarga perder autorização, ocultar dados e encerrar o fluxo. 401/403 limpa caches e rascunhos administrativos pertinentes; 404 encerra ação do alvo inexistente.
- Senha administrativa guarda identidade/versão do alvo, mostrando nome/e-mail/perfil. Limpar campos de senha ao abrir, cancelar, fechar, concluir, conflitar ou perder acesso; após conflito/falha ambígua exigir nova leitura e nova digitação. Limpar também variáveis da mutation após a conclusão; não persistir segredos em cache/localStorage/logs.
- Troca própria carrega a identidade atual de `/auth/me` ao abrir, sem depender da versão antiga do login e sem exigir `users.view`. Carregamento falhando bloqueia envio. Mudança concorrente exige recarga e nova digitação; sucesso mantém a saída/reautenticação já prevista.
- Exclusão passa a confirmar identidade exibida e efeitos sobre acesso/sessões, em modal com versão capturada. Conflito exige leitura atual e nova confirmação; sem reenvio automático ou exclusão por ID isolado.
- Evitar fechamento/reabertura e troca de alvo enquanto uma operação está pendente, ou proteger callbacks por identidade da operação. Não deixar resposta atrasada de um alvo limpar/alterar outro modal.

**Aceite:** disputas editar×editar, editar×senha, senha própria×administrativa, senha×excluir, editar×excluir, excluir×excluir, autor=alvo e último administrador. Rejeição mantém versão/cadastro/sessões/histórico; sucesso preserva revogação e referências. Verificar primeira versão/default, no-op, limites, migração e rollback. Componentes e Chrome com duas abas devem provar recarga falhando, revisão explícita, nenhuma senha retida ao reabrir/trocar alvo e nenhuma mutação automática. Validar avisos nos temas claro e escuro. Cópias, atualização conjunta, smoke, CI, comparação de dados e publicação completam o recorte.

## Retomada

Próximo passo: **implementar 2B.8.3.1**, começando pelos testes que esperam rejeição após revogação e pelo transporte obrigatório de sessão aos casos de uso. Não repetir diagnóstico geral ou os seis probes. Versionamento/UI ficam explicitamente pendentes da 2B.8.3.2; R18 continua parcial. Não há decisão de negócio pendente para iniciar o primeiro recorte.
