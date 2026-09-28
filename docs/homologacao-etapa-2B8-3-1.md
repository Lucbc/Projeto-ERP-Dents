# Homologação 2B.8.3.1 — sessão nas escritas de usuários

## Mudança

Criação, edição, redefinição administrativa de senha, exclusão de usuário e troca da própria senha recebem obrigatoriamente a identidade de sessão extraída do cookie assinado. Sob o bloqueio administrativo já existente, verificam sessão pertencente ao ator e ainda válida pelo relógio atual do banco. Só então verificam conta/permissões e gravam. Troca própria também exige conta ativa.

Logout, inativação, rebaixamento, exclusão ou redefinição confirmados antes impedem uma operação que aguardava o bloqueio. Uma operação confirmada primeiro permanece válida. Outra sessão ainda válida e mudanças compatíveis de nome continuam funcionando. Preservados último administrador, delegação, política de senhas, limitação de tentativas e revogação transacional.

Não há migração, mudança de payload público ou interface. Versão dos formulários de usuários permanece pendente da 2B.8.3.2. Esta entrega não adiciona revalidação de sessão a todos os recursos do ERP.

## Evidências

- Oito testes novos de PostgreSQL em schemas privados: cinco operações contra cinco formas de revogação após espera comprovada no bloqueio; ordem inversa com logout; sessão expirada/alheia/inexistente; expiração durante espera; nome compatível; falha de commit com preservação de cadastro/sessões; conta inativa mesmo com sessão presente e outra sessão válida após logout.
- Testes existentes de administração, sessões e permissões adaptados para fornecer sessões reais de fixture, sem bypass de autorização em produção. **51 testes focados aprovados em 173,703s**, incluindo os oito novos.
- Dez grupos HTTP aprovados em API/schema exclusivos: operações válidas, cinco revogações negando as cinco escritas, preservação do alvo, sessão independente, bootstrap/reinício/limpeza. Incluído no CI. Chamadas HTTP sequenciais validam contrato e autenticação; a evidência de espera concorrente vem dos testes de banco/casos de uso.
- Build API aprovado. Sem mudança visual, portanto sem novo Chrome. Logs/credenciais/cópias em diretórios ignorados.

## Entrega e retomada

Implementação `5b58c4e` publicada e HEAD remoto conferido. **CI [36452387233](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/36452387233) aprovado em 19min56s:** 291 backend em 682,785s e 113 frontend, builds, regressão HTTP, auditoria de dependências e seis imagens sem achados nessa execução.

Cópias públicas/exames/fingerprints `pre-2B8-3-1*` salvas antes dos testes e dump completo após zero schemas privados; helper local `.data/upgrade_2b831.py`. API principal atualizada, HTTPS 200 e dez verificações gerais aprovados. Comparação confirmou negócio/histórico/bytes preservados; revisão `0023_permission_version`, zero schemas privados e nenhum volume removido. Etapa concluída em 28/09/2026; fechamento documental publicado separadamente após o CI.

Próximo recorte após o fechamento: 2B.8.3.2, versão de usuário e recuperação explícita da interface. Inventário inclui agora o script local `apps/api/scripts/reset_admin_password.py`, fora de `src`: manutenção local sob bloqueio, sem sessão web. Na próxima migração ele deve consumir versão usando a leitura protegida, sem criar um bypass HTTP.
