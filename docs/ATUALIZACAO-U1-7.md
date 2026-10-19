# U1.7 — data de nascimento sem futuro

Iniciada em 19/10/2026, base `3eb6f75` (`piloto-cadastros-v0.1.8`). Implementação em validação; nova versão ainda não liberada.

## Comportamento

- Novos cadastros e alterações da data de nascimento recusam datas posteriores ao dia civil da clínica, em `America/Sao_Paulo`.
- Hoje, datas passadas e campo ausente continuam permitidos; não há limite arbitrário de idade.
- Data histórica mantida não impede editar contato/notas/outros campos, mesmo quando está no futuro. Limpar ou corrigir a data continua possível; nenhuma regravação automática.
- A API valida na transação da gravação, preservando a versão e evitando gravação parcial. Datas impossíveis já são recusadas pelo contrato da API.
- O formulário verifica no envio, usando o fuso da clínica e mantendo o rascunho. Não usa uma data máxima nativa que bloquearia a edição de históricos.
- O relógio do servidor precisa estar correto; o backend continua sendo a autoridade quando o computador do usuário estiver com horário incorreto.

## Aceites

1. Domínio: UTC já no dia seguinte enquanto São Paulo ainda está no anterior; hoje, ausente e ano bissexto.
2. Banco privado: recusa de criação/alteração futura, nenhuma alteração parcial, históricos mantidos, limpeza/correção e conflito de versão antiga.
3. Interface: futuro recusado, rascunho preservado, correção para hoje e histórico futuro editável.
4. Chrome/API: criar/editar com futuro, data impossível, preservar histórico em conflito/reabertura e regressões do cadastro.
5. Atualização a partir da v0.1.8 com data futura anterior; preservar tabelas/backup/exame/sessão/configuração/TLS/volumes.
6. CI completo e auditorias antes de liberar pacote e atualizar guias.

## Retomada

Build API/web e 19 testes de componente aprovados. Regressão PostgreSQL, Chrome/API, suíte frontend completa e auditoria em execução. Logs locais `.data/birth-date-build.log`, `.data/birth-date-components.log`, `.data/birth-date-db.log`, `.data/birth-date-browser.log`, `.data/birth-date-frontend.log`, `.data/birth-date-audit.log`. Publicar código para CI enquanto concluem os aceites locais; ainda falta ensaio de atualização para liberar pacote. Usar somente recursos privados de `erp-dents-homolog` e dados fictícios. Sem migração, atualização principal ou instalação física. P3 físico tem prioridade quando chegarem os dados do servidor.
