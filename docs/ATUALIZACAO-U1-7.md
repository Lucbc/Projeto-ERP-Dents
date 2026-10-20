# U1.7 — data de nascimento sem futuro

Concluída em 19/10/2026, base `3eb6f75` (`piloto-cadastros-v0.1.8`). Versão de instalação: `piloto-cadastros-v0.1.9`; código funcional `803ee67`.

Próximo recorte possível, após concluir esta entrega: entrada de RG. Leitura do formulário confirma preservação ao abrir edição (`patient.rg ?? ""`), mas `normalizeRg` remove caracteres e limita a 14 posições durante a digitação. Reproduzir em componente/Chrome antes de corrigir; não tratar esta leitura como aceite funcional nem impor formato estadual único. Esse recorte não condiciona a instalação do piloto.

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

## Evidências e retomada

Atualização `v0.1.8` → `803ee67` aprovada em **146,31 s** de manutenção sem build/download. Backup restaurado e tabelas comparadas; volumes/configuração/TLS/exame/sessão preservados. Data futura criada na versão antiga continuou intacta/editável após atualizar, novas atribuições futuras recusadas sem mudanças parciais, campo ausente aceito e novo login aprovado. Log `.data/birth-date-update.log`, relatório `.data/install_e822f8373a6d/result.json`.

Ensaio por API/HTTPS, navegador validado separadamente. Backup do harness; rotina Windows operacional validada anteriormente. Proxies/dependências idênticos entre versões. Sem migração, instalação física ou alteração principal; tempo local não prevê a janela da clínica. Guias incluem conferência de relógios do servidor/estações antes do início dos cadastros.

Build API/web, 19 testes de componente e 35 testes de domínio/PostgreSQL aprovados (187,961 s, incluindo regressões de CPF, concorrência e exclusão). Chrome/API aprovado: futuro/impossível recusados, rascunho mantido e histórico futuro editável após conflito/reabertura. Auditoria das seis imagens sem achados. Frontend completo aprovado: 405 testes / 46 arquivos, 226,57 s. Ensaio de atualização aprovado, conforme evidências acima. Logs locais `.data/birth-date-build.log`, `.data/birth-date-components.log`, `.data/birth-date-db.log`, `.data/birth-date-browser.log`, `.data/birth-date-frontend.log`, `.data/birth-date-audit.log`. Código `803ee67` aprovado no [CI 39298646785](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/39298646785): 324 testes backend, 405 frontend, builds, regressões HTTP e auditorias. Log local `.data/birth-date-ci-final.log`. Aceites concluídos; guias de instalação, atualização e recepção consolidados para v0.1.9. Usar somente recursos privados de `erp-dents-homolog` e dados fictícios. Sem migração, atualização principal ou instalação física. P3 físico tem prioridade quando chegarem os dados do servidor.
