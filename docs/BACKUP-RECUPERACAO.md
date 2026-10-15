# Backup e recuperação — servidor Windows

## Estado em 15/10/2026

Backup assistido implementado; restauração de banco e bytes de exames comprovada com dados fictícios em `erp-dents-homolog`. A aplicação ainda não foi conectada ao conjunto recuperado. Configuração/TLS foram copiados, mas não ativados em outra máquina. **A recuperação completa do serviço e a liberação clínica permanecem pendentes.**

## Fazer uma cópia — suporte

Avisar os usuários e escolher uma janela sem cadastros, envios, testes ou alterações de configuração. A rotina interrompe a API durante a cópia; navegador e servidor podem continuar ligados, mas as operações ficam indisponíveis. Apenas um operador deve executar manutenção por vez.

Na pasta do projeto, com a mesma conta Windows que administra Docker/configuração, escolher uma pasta nova em destino de backup cujo diretório pai já exista:

```powershell
.\scripts\backup-server.ps1 -Destination 'E:\Backups-ERP\2026-10-15-antes-atualizacao'
```

Esse comando seleciona **produção** (`erp-dents-prod`, `.env`, `docker-compose.yml`). O caminho é exemplo: substituir unidade/data. Nunca executar contra produção para testes. Se o destino já existir, a rotina recusa sem sobrescrevê-lo. Banco, API e HTTPS precisam estar em execução; volumes devem corresponder ao projeto padrão. O script recusa outro container utilizando o volume de exames.

A rotina:

1. Confere projeto, containers e volumes; cria pasta com acesso restrito à conta atual, SYSTEM e administradores.
2. Marca a cópia como `INCOMPLETE` e para a API, aguardando sua saída.
3. Copia PostgreSQL em formato próprio de restauração (`database.dump`) e todos os exames, inclusive quarentena (`exams.tar`).
4. Copia configuração local (`server.env`), certificado/chave usados pelo HTTPS (`tls`) e, quando presente, o certificado público da autoridade.
5. Registra versão Git, imagens e hashes SHA-256 em `manifest.json`; remove `INCOMPLETE` somente após finalizar a cópia.
6. Tenta reiniciar a API, inclusive quando a cópia falha. Conferir `/health`, login e acesso aos cadastros antes de encerrar a manutenção. Se o reinício falhar, manter atendimento suspenso e acionar o suporte.

O dump não depende de redirecionamento binário do PowerShell. PostgreSQL fica ligado; nenhum volume é removido. Não alterar código, configuração, certificado ou banco por ferramentas externas durante o backup. A cópia não inclui imagens Docker nem todos os arquivos do repositório: guardar a versão indicada no manifesto e garantir acesso ao código/imagens aprovados também faz parte da recuperação.

## Guardar e conferir

- Um destino no mesmo disco não protege contra perda do computador. Guardar cópia separada e protegida, com responsável e frequência definidos; fazer backup antes de cada atualização e conforme o volume diário de cadastros.
- O backup contém dados clínicos, senhas de configuração e chave privada. As permissões Windows restringem acesso, mas **não criptografam o conteúdo**. Preservar a proteção no destino externo; não enviar ao Git, e-mail ou pasta pública.
- Nunca tratar pasta com `INCOMPLETE`, manifesto ausente ou hash divergente como cópia válida. Uma falha deixa os arquivos para inspeção, sem apagar backups anteriores.
- Hash confirma integridade em relação ao manifesto; não comprova autenticidade de um backup recebido de terceiros. Utilizar somente cópias controladas pelo suporte.
- Não editar o backup após concluído. Testar recuperação em ambiente separado; a mensagem de cópia concluída não substitui esse teste.

## Ensaios de desenvolvimento — exclusivamente fictícios

Na raiz do projeto, com Docker de homologação aberto:

```powershell
.\scripts\backup-server.ps1 -Environment homolog -Destination '.data\backup-ensaio-novo'
python scripts/smoke_backup_restore_homolog.py '.data\backup-ensaio-novo'
```

Python aqui é dependência do ensaio do desenvolvedor, não dos usuários da clínica. O verificador aceita somente backups de homologação em `.data`, valida hashes antes de restaurar, cria banco com nome aleatório no PostgreSQL de homologação e volume exclusivo para exames. Compara todas as linhas das tabelas públicas com a origem e os arquivos recuperados com o arquivo de backup; por isso deve ser executado logo após a cópia, sem alterações concorrentes na origem.

O banco temporário e container auxiliar são removidos ao final. O volume recuperado é preservado para inspeção, identificado como `erp-dents-homolog-restore-<id>`; não é conectado à API existente. Nenhum volume anterior é removido. O ensaio não restaura sobre o banco original e não é ferramenta de restauração em produção.

`test-backup-failure-homolog.ps1` simula falha ao identificar a versão Git, depois das cópias, e verifica `INCOMPLETE`, ausência de manifesto completo, proteção da configuração e reinício da API. Mantém a cópia incompleta local para inspeção.

## Recuperação na clínica — próxima subetapa

Ainda será entregue e ensaiado o roteiro completo para um destino vazio: conferir versão e backup, preparar banco/volume exclusivos, recuperar configuração/HTTPS com permissões, iniciar aplicação e validar login, pacientes e download de exame. Só após esse aceite haverá procedimento de troca do ambiente ativo.

Até lá, não executar restauração manual sobre produção nem apontar a aplicação para os recursos de teste. Recuperar uma cópia antiga pode perder todos os cadastros feitos depois dela; qualquer troca precisa preservar o estado atual e considerar essa diferença.

## Evidência desta entrega

- Cópias fictícias geradas em `.data`, inclusive destino com espaço no nome; nenhum conteúdo sensível publicado.
- Duas restaurações isoladas aprovadas: linhas de todas as tabelas públicas e um arquivo de exame comparados, origem preservada.
- Falha injetada aprovada: cópia incompleta identificada e API reiniciada.
- Destino existente recusado sem sobrescrita; manifesto com hash incorreto recusado antes de criar recursos de restauração.
- HTTPS confiável `/health` retornou 200 após os ensaios. Não foi feito novo teste de interface ou login da aplicação restaurada.
