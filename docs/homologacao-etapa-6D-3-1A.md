# 6D.3.1A — gravação da auditoria administrativa

Início: 06/11/2026, base `29953bd`. **Gravação concluída em 07/11/2026; nenhuma tag nova publicada.** Esta é a fundação de gravação, sem endpoint/tela de leitura. A entrega completa inclui a consulta protegida, migração/recuperação e aceite de interface em subetapas posteriores.

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
- **CI aprovado em 07/11:** a execução [42273451399](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/42273451399) passou nos 530 testes frontend e parou no build, antes do backend: `zlib=1.3.2-r1` indisponível. Reprodução descartável confirmou `1.4-r0` disponível. Pin atualizado nas cinco definições Docker em `de130e1`; seis imagens reconstruídas localmente, sem reiniciar serviços/volumes principais. Novo [CI 42401571437](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/42401571437) aprovado em `de130e1`: 530 testes frontend, 375 backend (778,504 s), fluxos HTTP incluindo a nova auditoria e seis imagens sem achados. Execução completa em aproximadamente 24 minutos; log local `.data/audit-zlib-ci-final.log`. Execuções `42273055381`/`42273269384` canceladas para incorporar os ajustes dos testes. A instalação nova da v0.1.28 também precisa da correção de build, registrada no roteiro; nenhuma tag nova publicada.

## Revalidação das imagens — 07/11/2026

- Build das seis imagens com `zlib=1.4-r0` aprovado (`.data/audit-zlib-build.log`). Nenhum serviço principal foi reiniciado e nenhum volume removido.
- Scanner local retornou zero achados nas seis imagens (`.data/audit-zlib-security.log`), base de vulnerabilidades atualizada em 07/11/2026 às 12:52 UTC. Resultado limitado à base consultada; não é garantia de ausência de vulnerabilidades desconhecidas.
- Cadastros novamente aprovados em Chrome/API/SQL com as imagens reconstruídas (`.data/audit-zlib-registration.log`): inicialização, sessão, CPF, nascimento, documentos históricos, permissões, conflitos, reabertura e RG. Esquema/API temporários removidos, dados e volumes originais preservados.

## Próximo passo

6D.3.1B: leitura paginada/filtrada com permissão específica, revogação verificada antes de retornar metadados, estados de erro/vazio e UI. Usar o [inventário e critérios](./PLANO-AUDITORIA.md); decidir no desenho como exibir IDs de contas excluídas sem inventar identificação. Antes de publicar nova instalação: homologar avanço 0026→0027 com dados existentes e backup/restauração com eventos, preservar volumes e atualizar os guias. O harness de recuperação clínica possui uma expectativa explícita de 0026 que deve ser adaptada junto com o novo ensaio de recuperação, sem afirmar que já foi reexecutado.

Não executar atualização física com o HEAD desta subetapa. Os guias continuam fixados na tag aprovada v0.1.28. P3 físico prioritário; odontograma posterior.
