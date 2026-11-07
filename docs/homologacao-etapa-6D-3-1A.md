# 6D.3.1A — gravação da auditoria administrativa

Início: 06/11/2026, base `29953bd`. **Em validação; instalação permanece v0.1.28.** Esta é a fundação de gravação, sem endpoint/tela de leitura. A entrega completa inclui a consulta protegida, migração/recuperação e aceite de interface em subetapas posteriores.

## Contrato implementado

- Migração aditiva `0027_administrative_audit`, sem reescrever usuários/permissões existentes nem inventar autoria anterior.
- Eventos dos caminhos administrativos autenticados: criação/edição/exclusão de usuário, redefinição de senha e alteração de permissões. Cada evento grava ID, instante do banco, ator, alvo, versões e nomes dos campos alterados. Permissões registram somente diferenças das concessões efetivas.
- Nomes/e-mails e valores dos campos pessoais não são copiados; senha/hash/token/cookie/conteúdo clínico não entram no evento. Redefinição de senha registra a ocorrência, sem conteúdo da credencial.
- Evento inserido antes do commit da alteração e dentro da mesma transação. Falha de auditoria desfaz a alteração e eventual revogação de sessões; 403/409 não registram sucesso. Um salvamento aceito sem mudança de campos continua consumindo versão e gera evento com diferença vazia, conforme o contrato já existente.
- Sem vínculo que apague eventos ao excluir contas. UPDATE/DELETE/TRUNCATE recusados no histórico. Downgrade recusado quando há eventos. Administrador do banco continua capaz de alterar esquema/desabilitar proteções; não é proteção contra controle total do banco.
- Inicialização, troca da própria senha, recuperação administrativa por script e alterações diretas no banco não integram este recorte. Leitura de prontuários/downloads e edições de pacientes continuam fora dele. `actor_id` opcional no repositório preserva esses caminhos internos; os casos de uso administrativos autenticados sempre o fornecem.

## Evidências

- **PostgreSQL/casos de uso:** sete testes novos aprovados (33,431 s), em esquemas privados: autoria/versões, diferenças efetivas, ausência de valores pessoais/credenciais, rollback após inserir o evento nas cinco operações, negação/conflito, disputa de duas conexões com um vencedor, sobrevivência à exclusão de ator/alvo, imutabilidade e migração sem perda/fabricação de eventos. `.data/audit-unit.log`.
- **HTTP/SQL:** duas sessões administrativas, operador sem permissão, conflitos reais, falha injetada no INSERT de auditoria com rollback de usuário/versão/sessões, redefinição que revoga sessão, exclusão que preserva eventos e diferença exata de permissão. Bootstrap/reinício/limpeza privados passaram. `.data/audit-http.log`, harness `scripts/smoke_administrative_audit_homolog.py`; incluído no CI.
- **Interface:** não alterada nem homologada para consultar auditoria; a tela não existe nesta subetapa. Não apresentar os testes de API/banco como aceite Chrome.
- **Regressões:** 16 testes de administração aprovados (60,882 s) e 21 de permissões (91,336 s), incluindo concorrência, revogação, versões e rollback. O primeiro grupo ainda criava tabelas somente pelo ORM; foi atualizado para migrar o esquema privado real. Hooks dos testes de concorrência foram adaptados para encaminhar `actor_id`. As execuções anteriores acusaram esses problemas de preparação; não foram tratadas como aceites. Logs finais `.data/audit-user-administration-final.log` e `.data/audit-permission-final.log`.
- **Chrome/API/SQL de cadastros aprovado:** CPF/nascimento, históricos, permissões, busca, conflitos, reabertura e RG/limpeza explícita. `.data/audit-registration.log`. Isso verifica preservação do piloto; não é aceite visual de uma tela de auditoria.
- **CI pendente:** [42273451399](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/42273451399), código `7abe368`. Execuções `42273055381`/`42273269384` canceladas para incorporar os ajustes dos testes. Pacote de instalação permanece inalterado.

## Próximo passo

6D.3.1B: leitura paginada/filtrada com permissão específica, revogação verificada antes de retornar metadados, estados de erro/vazio e UI. Usar o [inventário e critérios](./PLANO-AUDITORIA.md); decidir no desenho como exibir IDs de contas excluídas sem inventar identificação. Antes de publicar nova instalação: homologar avanço 0026→0027 com dados existentes e backup/restauração com eventos, preservar volumes e atualizar os guias. O harness de recuperação clínica possui uma expectativa explícita de 0026 que deve ser adaptada junto com o novo ensaio de recuperação, sem afirmar que já foi reexecutado.

Não executar atualização física com o HEAD desta subetapa. Os guias continuam fixados na tag aprovada v0.1.28. P3 físico prioritário; odontograma posterior.
