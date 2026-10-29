# Backup e recuperação — servidor Windows

## Estado em 29/10/2026

O [aceite 4C.2](./homologacao-etapa-4C-2.md) também comprovou backup/restauração completos com rascunho, evolução finalizada, adendo e recibos clínicos, usando banco/volumes privados. Login, exames antigos/novos, Chrome e persistência após reinício passaram. A [instalação v0.1.25](./ATUALIZACAO-PRONTUARIO-V25.md) inclui esse conjunto; o acesso clínico começa negado. Os comandos de backup da clínica abaixo não mudaram. Após a migração 0026, não tentar downgrade ou restauração sobre os dados atuais para contornar falhas; seguir recuperação assistida em destino separado.

Backup assistido implementado; restauração de banco/exames e funcionamento da aplicação recuperada comprovados com dados fictícios em `erp-dents-homolog`. API/frontend privados usaram banco/volume restaurados, configuração de autenticação e certificados do backup, com endereço/porta de teste. Login, cadastro/edição, exames e reinício passaram. **Isso ainda não é uma instalação em outro computador nem um roteiro de troca de produção aprovado.**

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
5. Registra versão Git, imagens e hashes SHA-256 em `manifest.json`; remove `INCOMPLETE` somente após finalizar a cópia. Desde `v0.1.3`, registra também `archiveImage`, imagem auxiliar usada para copiar arquivos.
6. Tenta reiniciar a API, inclusive quando a cópia falha. Conferir `/health`, login e acesso aos cadastros antes de encerrar a manutenção. Se o reinício falhar, manter atendimento suspenso e acionar o suporte.

O dump não depende de redirecionamento binário do PowerShell. PostgreSQL fica ligado; nenhum volume é removido. Não alterar código, configuração, certificado ou banco por ferramentas externas durante o backup. A cópia não inclui imagens Docker nem todos os arquivos do repositório: guardar a versão indicada no manifesto e garantir acesso ao código/imagens aprovados também faz parte da recuperação.

Se a imagem original da API já não existir no catálogo local, a `v0.1.3` usa a imagem local `<projeto>-api` apenas no auxiliar Python de cópia, sem rede e com exames montados somente para leitura. Resolve essa imagem antes de parar a API e não faz download. A imagem original continua registrada em `apiImage`; o fallback não altera o serviço nem garante disponibilidade da imagem original para recuperação da aplicação. O ensaio de restauração de arquivos aceita `archiveImage`, mantendo compatibilidade com manifestos antigos.

Durante atualização, parar primeiro o gateway conforme o [roteiro de manutenção](./ATUALIZACAO-SERVIDOR-WINDOWS.md). O backup exige edge/HTTPS ligado para copiar certificados; o gateway parado impede que o reinício da API reabra acesso antes do aceite. Esse bloqueio foi ensaiado também em falha tardia do backup.

## Guardar e conferir

- Um destino no mesmo disco não protege contra perda do computador. Guardar cópia separada e protegida, com responsável e frequência definidos; fazer backup antes de cada atualização e conforme o volume diário de cadastros.
- O backup contém dados clínicos, senhas de configuração e chave privada. As permissões Windows restringem acesso, mas **não criptografam o conteúdo**. Preservar a proteção no destino externo; não enviar ao Git, e-mail ou pasta pública.
- Nunca tratar pasta com `INCOMPLETE`, manifesto ausente ou hash divergente como cópia válida. Uma falha deixa os arquivos para inspeção, sem apagar backups anteriores.
- Hash confirma integridade em relação ao manifesto; não comprova autenticidade de um backup recebido de terceiros. Utilizar somente cópias controladas pelo suporte.
- Não editar o backup após concluído. Testar recuperação em ambiente separado; a mensagem de cópia concluída não substitui esse teste.

## Rotina prevista na clínica

Informado pelo usuário: **um operador enviará os backups manualmente para um drive na nuvem toda semana**. Provedor, conta/pasta e responsável nominal ainda não foram definidos. Não há envio ou agendamento automático implementado.

Recomendação operacional para a digitação inicial: gerar backup local ao final de cada dia e antes de atualizações; enviar a cópia mais recente à nuvem semanalmente, conforme a rotina informada. O backup diário local é recomendação, ainda não uma rotina confirmada ou agendada.

1. Encerrar as gravações dos usuários e executar `backup-server.ps1` com uma pasta nova, fora da pasta sincronizada da nuvem. Esperar a conclusão e conferir a retomada do sistema.
2. Confirmar presença de `manifest.json` e ausência de `INCOMPLETE`. Enviar **a pasta completa**, incluindo `database.dump`, `exams.tar`, `server.env`, `tls` e manifesto. Não enviar somente o código do Git ou o dump do banco.
3. Usar conta controlada pela clínica e pasta com acesso restrito; o backup contém dados clínicos e segredos. As permissões locais do Windows não acompanham automaticamente o upload. Definir proteção do material com o suporte antes do primeiro envio real.
4. Esperar a conclusão de todos os uploads, conferir os arquivos no drive e registrar data da cópia, data do envio e operador. Manter a cópia anterior até conferir a nova; não enviar uma pasta enquanto o backup ainda estiver sendo escrito.
5. No primeiro envio, baixar a cópia em área protegida e conferir os hashes do manifesto com o suporte. O ensaio de restauração não deve ser feito sobre o servidor em uso.

**Limite dessa frequência:** se o servidor/disco for perdido, a recuperação pela nuvem alcança somente o último envio concluído. Com envios semanais, podem faltar até cerca de sete dias de novos registros — e mais se o operador esquecer um envio. Backup diário no mesmo computador não elimina esse risco. Durante a digitação intensa, preferir também envio diário à nuvem ou outra cópia externa diária, se a clínica puder ajustar a rotina.

## Ensaios de desenvolvimento — exclusivamente fictícios

Para o conjunto clínico, o harness `python scripts/smoke_clinical_full_recovery_homolog.py` prepara origem/destino privados e executa o script Windows com `-HomologFixture`. Esse parâmetro é restrito a testes locais de homologação e rejeita produção/containers principais; não deve ser acrescentado aos comandos da clínica. Ver [pré-requisitos, evidências e limites](./homologacao-etapa-4C-2.md). Os comandos históricos abaixo atuam sobre os dados fictícios principais de homologação e podem interromper sua API; não são o ensaio privado da 4C.2.

Na raiz do projeto, com Docker de homologação aberto:

```powershell
.\scripts\backup-server.ps1 -Environment homolog -Destination '.data\backup-ensaio-novo'
python scripts/smoke_backup_restore_homolog.py '.data\backup-ensaio-novo'
```

Para incluir recuperação da aplicação, HTTPS e Chrome, usar `--application` no segundo comando. Requer Node/Playwright, Chrome e a autoridade de homologação já confiável no Windows; configurar `PLAYWRIGHT_MODULE` se necessário. Reserva `127.0.0.1:18444` temporariamente: não executar junto com outros ensaios de navegador. Lê somente as credenciais fictícias locais de `.data/homolog/admin.json`, que devem corresponder ao banco copiado. Os valores nunca são impressos. Não cria confiança automaticamente nem ignora erros TLS.

O modo de aplicação prepara as permissões do **novo** volume para o usuário 10001, usando o inicializador já existente. Isso é necessário porque a extração segura do tar descarta proprietários. Em seguida, inicia API e frontend privados com o certificado recuperado; comprova login original, cadastro/edição de paciente sem CPF, download do exame anterior, upload/download novo, busca/reabertura em Chrome e persistência após reiniciar a API. Esses dados adicionais são fictícios e gravados somente na cópia; nenhuma API é apontada ao banco original.

Python aqui é dependência do ensaio do desenvolvedor, não dos usuários da clínica. O verificador aceita somente backups de homologação em `.data`, valida hashes antes de restaurar, cria banco com nome aleatório no PostgreSQL de homologação e volume exclusivo para exames. Compara todas as linhas das tabelas públicas com a origem e os arquivos recuperados com o arquivo de backup; por isso deve ser executado logo após a cópia, sem alterações concorrentes na origem.

O banco temporário e containers auxiliares são removidos ao final. O volume recuperado é preservado para inspeção, identificado como `erp-dents-homolog-restore-<id>`; não é conectado à API existente. Nenhum volume anterior é removido. O ensaio não restaura sobre o banco original e não é ferramenta de restauração em produção.

`test-backup-failure-homolog.ps1` simula falha ao identificar a versão Git, depois das cópias, e verifica `INCOMPLETE`, ausência de manifesto completo, proteção da configuração e reinício da API. Mantém a cópia incompleta local para inspeção.

## Recuperação na clínica — próxima subetapa

O percurso de recuperação já foi comprovado no ambiente isolado. Falta consolidar a operação para o servidor de destino: conferir versão e backup, preparar banco/volume exclusivos, recuperar configuração/HTTPS com permissões e endereço correto, iniciar aplicação e validar login, pacientes e download de exame. Não copiar valores `HOMOLOG_*` para produção. A troca do ambiente ativo continua sendo intervenção assistida e não é automatizada pelo ensaio.

Até lá, não executar restauração manual sobre produção nem apontar a aplicação para os recursos de teste. Recuperar uma cópia antiga pode perder todos os cadastros feitos depois dela; qualquer troca precisa preservar o estado atual e considerar essa diferença.

## Evidência desta entrega

- Cópias fictícias geradas em `.data`, inclusive destino com espaço no nome; nenhum conteúdo sensível publicado.
- Duas restaurações isoladas aprovadas: linhas de todas as tabelas públicas e um arquivo de exame comparados, origem preservada.
- Falha injetada aprovada: cópia incompleta identificada e API reiniciada.
- Destino existente recusado sem sobrescrita; manifesto com hash incorreto recusado antes de criar recursos de restauração.
- P1.3B: HTTPS recuperado confiável, login original, cadastro/edição, download do exame restaurado, upload/download novo e persistência após reinício aprovados via API. Chrome sem desabilitar TLS comprovou login, busca e reabertura do paciente. Banco de origem preservado; certificados, sessão e registros não publicados.
