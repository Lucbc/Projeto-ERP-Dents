# Atualização semanal do servidor Windows

## Estado — 22/10/2026

**P4.1/P4.2 concluídas no escopo de atualização sem nova migração.** Troca real de imagens `v0.1.1` → `v0.1.2` aprovada em recursos privados, com dados existentes; ferramentas operacionais consolidadas em `piloto-cadastros-v0.1.3`, sem mudança da aplicação em relação à `v0.1.2`. Este documento organiza a manutenção assistida; não é um atualizador automático nem comprovação de atualização em produção. A instalação inicial do piloto continua liberada pelo [roteiro Windows](./INSTALACAO-CLINICA-WINDOWS.md).

**Versão atual: `piloto-cadastros-v0.1.22`.** Integra horário de São Paulo nas telas, filtros, calendário, painel e pagamentos. Frente à v0.1.21, muda a imagem web, sem alteração de API, schema, migração ou configuração. [Detalhes e aceites](./homologacao-etapa-3B-3B-2.md). O roteiro continua reconstruindo/substituindo as seis imagens para atender versões anteriores à correção musl da v0.1.17; preservar os mesmos volumes. Mantém a migração 0025 introduzida na v0.1.11 para instalações anteriores. Não manter APIs de versões diferentes gravando juntas. Após atualizar, recarregar as abas das estações; interfaces anteriores à v0.1.11 não enviam o identificador de tentativa. A liberação operacional continua restrita ao piloto de cadastros.

Somente o suporte atualiza o servidor. As estações continuam usando a mesma URL e não precisam instalar pacotes. Fazer a manutenção em janela combinada, com um único operador e todos os usuários fora do sistema até o aceite final.

## 1. Preparar a versão antes da janela

1. Escolher uma tag explicitamente liberada nas notas do projeto e registrar seu commit, o commit atual e a data. Conferir o resultado dos testes da versão; a existência de uma tag não comprova sua aprovação.
2. Obter a tag do remoto configurado, sem trocar o código em execução. No repositório do servidor, o suporte pode usar `git fetch origin --tags` e conferir `git status --short`. Parar em caso de conflito de tag ou alterações locais; não usar `--force`, `reset --hard` ou `clean` para contornar.
3. Ler as notas de atualização: mudanças de configuração, migrações e recuperação. A conferência de ancestralidade Git não prova compatibilidade de banco.
4. Conferir espaço para backup e imagens, acesso ao código/dependências, Docker funcionando e destino externo protegido. Guardar a configuração existente; não executar os geradores de `.env`/certificados de instalação nova em cada atualização.

### Conferência somente de leitura

O suporte pode executar `scripts/check-update-version.ps1` de uma cópia das ferramentas da `v0.1.3`, apontando para o repositório instalado. Para instalações anteriores, ele não existe na pasta antiga; executar da cópia de suporte, sem trocar o código do servidor apenas para obter esse verificador.

Exemplo, substituindo a tag pelo destino aprovado e o caminho pela instalação real:

```powershell
.\scripts\check-update-version.ps1 -Repository 'C:\ERP-Dents' -TargetTag 'piloto-cadastros-v0.1.21'
```

O comando exige histórico completo, árvore de trabalho limpa, tag local no formato do piloto, destino igual ou descendente do commit atual e presença dos arquivos básicos de implantação. Exibe somente identificadores Git e mensagens de estado. Não lê `.env`, não faz fetch/checkout e não chama Docker.

Se indicar que o código já está na versão escolhida, ainda é necessário conferir as imagens realmente em execução. A checagem não certifica backup, migrações, TLS ou funcionamento do sistema. Um destino anterior/divergente é recusado: rollback exige análise própria, não uma exceção automática.

## 2. Executar a janela — suporte, um bloco por vez

1. Avisar a indisponibilidade, retirar os usuários e registrar o início da janela. Escolher um cadastro existente para verificar depois, sem copiar dados pessoais para logs ou Git.
2. Parar o gateway antes do [backup completo](./BACKUP-RECUPERACAO.md). Isso bloqueia os pedidos à API; a página pode continuar aparecendo no navegador. HTTPS/edge permanece ligado para permitir a cópia dos certificados. Conferir manifesto e ausência de `INCOMPLETE`; preservar cópia anterior e garantir destino separado. Se falhar, não avançar para troca de versão.
3. **O script de backup tenta reiniciar a API ao terminar, inclusive após falha. O gateway permanece parado, mantendo o bloqueio.** Manter os usuários fora e parar novamente a API antes da troca.
4. Aplicar a tag aprovada e construir/substituir os serviços previstos nas notas, preservando nome do projeto, configuração, TLS e volumes. Não executar `down -v`, limpeza de volumes ou downgrade automático. Os blocos abaixo cobrem o piloto sem mudança de banco, dependências ou infraestrutura; versões com novas migrações exigem notas e ensaio próprios.
5. Verificar estado dos serviços, migrações e HTTPS sem ignorar certificado. Conferir login individual, busca por nome/CPF, paginação, abertura e edição autorizada, além de conferir cadastros anteriores. Se houver exames, verificar acesso a um arquivo anterior. Não registrar conteúdo clínico nos relatórios.
6. Reabrir o acesso somente após essas verificações. Registrar versões, horário de início/fim, resultado e responsável, sem segredos/dados pessoais. Em cada estação, recarregar a página e entrar novamente se necessário.

### Comandos para o piloto sem nova migração

**Somente no servidor da clínica, nunca neste ambiente de desenvolvimento.** Executar cada bloco separadamente e parar em qualquer erro. Antes, concluir a conferência de versão e a preparação do destino de backup. Não colar todos os blocos sem verificar seus resultados.

```powershell
Set-Location C:\ERP-Dents
$composeArgs = @('compose', '--project-name', 'erp-dents-prod', '--env-file', '.env', '-f', 'docker-compose.yml')
docker @composeArgs config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Configuracao invalida; nao continuar.' }
docker @composeArgs stop -t 60 gateway
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel bloquear o acesso; nao continuar.' }
```

Confirmar que tentativas de acesso à API ficam indisponíveis. Pode haver erro 502/504 ou espera até o tempo limite do proxy. A API não deve publicar porta diretamente na rede. Com os usuários fora, executar o backup **da versão instalada**, em pasta nova cujo diretório pai exista:

```powershell
.\scripts\backup-server.ps1 -Destination 'E:\Backups-ERP\antes-atualizacao-2026-10-16'
```

Substituir data/unidade. Conferir a cópia antes de seguir. Se a imagem original da API tiver sido removida do Docker, backups anteriores à `v0.1.3` podem falhar; preservar a cópia incompleta e resolver com o suporte, sem trocar a versão para contornar a falta de backup. A `v0.1.3` confere uma imagem auxiliar local disponível antes de parar a API; não baixa imagens durante essa seleção.

```powershell
docker @composeArgs stop -t 60 api
if ($LASTEXITCODE -ne 0) { throw 'API ainda nao confirmada como parada.' }
git checkout --detach piloto-cadastros-v0.1.21
if ($LASTEXITCODE -ne 0) { throw 'Troca de versao falhou; manter manutencao.' }
git rev-parse HEAD
docker @composeArgs config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Configuracao invalida na nova versao.' }
docker @composeArgs build api web gateway edge db clamav
if ($LASTEXITCODE -ne 0) { throw 'Construcao falhou; manter manutencao.' }
```

Conferir o commit exibido com a versão aprovada. Para v0.1.21, o roteiro mantém a troca das seis imagens para cobrir versões anteriores; frente à v0.1.20, mudaram web/gateway/edge/clamav. A versão principal do PostgreSQL permanece 16. Com API e gateway parados e backup conferido, recriar banco/antivírus e aguardar saúde antes de subir a API. Preservar os volumes existentes; nunca usar `down -v`. Atualizações partindo da v0.1.10 ou anterior também recebem a migração 0025 dos comprovantes. O backup completo do PostgreSQL inclui essa tabela. Não apagá-la nem executar downgrade para contornar erros: isso removeria a proteção de tentativas já processadas.

```powershell
docker @composeArgs up -d --no-deps --force-recreate --wait --wait-timeout 180 db clamav
if ($LASTEXITCODE -ne 0) { throw 'Banco ou antivirus nao ficaram saudaveis; manter manutencao e verificar logs sem apagar volumes.' }
docker @composeArgs up -d --no-deps --force-recreate api
if ($LASTEXITCODE -ne 0) { throw 'Inicio da API falhou; manter manutencao.' }
docker @composeArgs up -d --no-deps --force-recreate gateway web
if ($LASTEXITCODE -ne 0) { throw 'Proxies nao iniciaram; manter usuarios fora.' }
docker @composeArgs up -d --no-deps --force-recreate edge
if ($LASTEXITCODE -ne 0) { throw 'HTTPS nao iniciou; manter usuarios fora.' }
docker @composeArgs ps -a
```

Os proxies são recriados para resolver o endereço da API substituída. A partir daí o suporte testa a URL HTTPS e `/health`, novo login, registro anterior, busca, edição e exame anterior, antes de avisar os usuários. Se falhar, parar novamente `gateway` com o primeiro bloco de bloqueio e investigar. Não concluir sucesso somente porque os containers estão ligados.

## 3. Se houver falha

Manter a manutenção, preservar código/configuração/volumes e a cópia anterior. Registrar a etapa e o erro sem segredos. Acionar o suporte para avaliar se a falha é de aplicação, infraestrutura ou migração. Não repetir comandos de escrita indiscriminadamente, não reverter código supondo que isso reverta o banco e não restaurar uma cópia antiga sobre registros novos.

A recuperação validada usa ambiente isolado. A decisão de substituir produção e tratar registros posteriores ao backup é assistida; não há restauração destrutiva automática neste procedimento.

## Evidências e próximo passo

- Pacote `v0.1.17`: atualização `v0.1.16` → `f2f903a` aprovada em **189,19 segundos**, sem build/download. Seis imagens substituídas, incluindo PostgreSQL e ClamAV; musl/musl-utils 1.2.6-r3 conferidos. Todas as tabelas, volumes/configuração/TLS, sessão e exame preservados; backups anterior/posterior restaurados, reenvio após reinício e novo login aprovados. Sem migração; API/HTTPS no ensaio, Chrome validado separadamente. [Evidências e limites U1.14](./ATUALIZACAO-U1-14.md).
- Pacote `v0.1.11`: atualização `v0.1.10` → `885acb5` aprovada em **170,41 segundos** sem build/download. Migração aditiva 0025 preservou linhas anteriores, sessão/exame/volumes/configuração/TLS. Backups anterior e posterior restaurados e comparados, incluindo novos comprovantes; reenvio após reinício retornou o mesmo paciente. Ensaio por API/HTTPS, navegador validado separadamente; backup do harness, sem instalação física. [Evidências e limites](./ATUALIZACAO-U1-9.md).
- Pacote `v0.1.9`: atualização `v0.1.8` → `803ee67` aprovada em **146,31 segundos** sem build/download. Data futura histórica preservada/editável e novas atribuições futuras recusadas sem gravação parcial. Backup restaurado, tabelas/volumes/configuração/TLS/exame/sessão mantidos e novo login aprovado. Sem migração ou alteração de dependências. [Evidências e limites U1.7](./ATUALIZACAO-U1-7.md).
- Pacote `v0.1.8`: atualização `v0.1.7` → `5f23b8f` aprovada em **146,2 segundos** sem build/download. Histórico inválido preservado/editável, novos CPFs incorretos ou repetidos recusados, CPF ausente aceito. Backup restaurado, tabelas/volumes/configuração/TLS/exame/sessão mantidos e novo login aprovado; sem migração ou mudança de dependências. [Evidências e limites U1.6D](./ATUALIZACAO-U1-6D.md).
- Pacote `v0.1.7`: ensaio final `v0.1.6` → `005c28d` aprovado em **63,94 segundos** sem build/download, incluindo troca de API/web/proxies, versões corrigidas das bibliotecas, duplicados históricos preservados/editáveis e bloqueio de novas atribuições de CPF. Backup restaurado, tabelas/volumes/configuração/TLS/exame/sessão mantidos e novo login aprovado. [Evidências e limites U1.6C](./ATUALIZACAO-U1-6C.md).
- `powershell -NoProfile -File scripts/test-check-update-version.ps1`: nove cenários reais de Git aprovados, com conteúdo fictício em repositório exclusivo sob `.data`; HEAD, estado e referências preservados em cada verificação. Log ignorado `.data/update-version-test.log`.
- `smoke_windows_update_homolog.py`: imagens construídas das tags, Compose de produção adaptado para nomes/rede/volumes privados de `erp-dents-homolog`; dump restaurado, todas as tabelas comparadas antes/depois, mesmos volumes/configuração/TLS, exame/sessão preservados, busca nova, edição e novo login aprovados. Backup privado do harness separado do script operacional. Não repetiu ensaio de navegador, reinício físico ou nova migração.
- `smoke_update_backup_gate_homolog.py`: script Windows real com gateway parado, backup completo e restauração comparada, falha tardia injetada mantendo bloqueio mesmo após reinício da API. Dados de origem preservados; gateway reaberto com HTTPS saudável. Nenhum volume removido.
- Ensaio privado anterior: **109,31 segundos**, incluindo cópia/verificações e novo login; imagens já construídas. Execução anterior com menos verificações: 41,86 s. Não são previsão para a clínica: construção/download, volume de dados e recursos do outro Windows podem aumentar bastante a janela.
- Ensaio adicional do pacote `v0.1.4`: **50,84 segundos**, imagens já construídas, incluindo troca de API/web e preservação. Log `.data/update-phone-package.log`. A variação entre ensaios reforça que esses tempos não dimensionam a janela na clínica.
- Logs locais ignorados: `.data/update-integrated-final.log`, `.data/update-backup-gate.log`; relatórios aprovados `.data/install_41487b31edcd/result.json` e `.data/update-gate-fca548f459324174aa8f2e90ebd8d7ff.result.json`.
- Próximo: instalação/aceite físico P3 e definição da janela semanal com a clínica. Futuras mudanças de esquema/infraestrutura exigem novo ensaio; não bloquear o início dos cadastros pelas melhorias gerais adiadas.
