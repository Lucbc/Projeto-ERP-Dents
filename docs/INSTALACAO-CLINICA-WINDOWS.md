# Instalação na clínica — servidor Windows

Atualizado em 15/10/2026. Dados serão cadastrados do zero, em outro computador Windows.

## Como será o uso

O servidor fica ligado e concentra o programa, banco e exames. Cada estação abre o mesmo endereço HTTPS pelo navegador, com login individual. Somente o servidor precisa de Docker. As estações não precisam de Git, Python, Node ou banco de dados.

**Situação atual:** roteiro de implantação assistida; o instalador completo e a restauração ainda estão em desenvolvimento no [piloto P1](./PLANO-PILOTO-CADASTROS.md). Os comandos abaixo correspondem à estrutura existente. Não iniciar cadastros reais antes dos critérios do passo 8. A instalação na clínica ainda não foi executada.

## 1. Preparar o computador servidor — suporte

1. Conferir edição/versão do Windows e virtualização. Seguir os [requisitos e instalação oficiais do Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/), consultados em 15/10/2026. **Windows Server é outro produto e não é suportado pelo Docker Desktop**; se essa for a edição instalada, definir outra infraestrutura antes de continuar.
2. Instalar Docker Desktop com suporte a containers Linux e abrir o aplicativo. Conferir os termos de uso aplicáveis à clínica.
3. Instalar Git para obter as versões do projeto. Não é necessário instalar Python/Node no servidor para construir pelo Docker.
4. Reservar recursos para o ERP: o Compose atual limita o ClamAV a 4 GiB; na homologação havia aproximadamente 8 GiB disponíveis ao Docker. Isso é referência do ensaio, não dimensionamento final do computador. Conferir memória, espaço para banco/exames, imagens e backups antes da instalação.
5. Manter o servidor ligado durante o uso, ajustar suspensão e definir quem inicia/verifica o Docker após reiniciar o Windows. Testar um reinício completo antes da liberação; `restart: unless-stopped` não inicia o Docker Desktop sozinho.

## 2. Definir o endereço e a cópia de segurança — suporte

- Reservar IP estável no roteador e definir um nome de rede para o ERP. O nome deve resolver para esse IP em todas as estações.
- Escolher uma única URL, por exemplo `https://erp.clinica.local` (exemplo, não endereço já configurado).
- Permitir a porta HTTPS escolhida no firewall somente para a rede autorizada. Não publicar banco/API nem encaminhar portas no roteador para a internet.
- Definir responsável, destino separado do disco do servidor e acesso restrito aos backups. Registrar a URL e o responsável; guardar senhas em local próprio, fora deste documento/Git.

## 3. Obter a versão — no servidor

Abrir PowerShell. Exemplo de pasta nova:

```powershell
git clone https://github.com/Lucbc/Projeto-ERP-Dents.git C:\ERP-Dents
Set-Location C:\ERP-Dents
git status --short
git rev-parse HEAD
.\scripts\check-server.ps1
```

Autenticar no GitHub se solicitado, sem inserir tokens no comando. O suporte deve selecionar e registrar o commit aprovado para implantação antes de construir; o último commit de `main` não é automaticamente uma versão liberada. Se a pasta já existe, não clonar por cima nem sobrescrever configurações.

O diagnóstico verifica somente Docker acessível, engine Linux e Compose. Não cria containers, não lê `.env` e não confirma que o ERP está pronto. Se a política corporativa impedir scripts PowerShell, solicitar ao suporte a execução conforme essa política.

## 4. Preparar configuração e HTTPS — suporte

Para uma instalação nova, não é mais necessário copiar o arquivo de exemplo nem montar a conexão do banco manualmente. Na pasta do projeto, executar com a conta Windows que administrará o ERP, substituindo o endereço pelo nome/IP definitivo:

```powershell
.\scripts\configure-server.ps1 -PublicOrigin https://erp.clinica.local
```

O comando cria `.env` na raiz do projeto com senha de banco, chave de sessão e código de ativação independentes, sem mostrá-los. Configura conexão interna com `db`, origem HTTPS, porta (443 por padrão), exames e fuso `America/Sao_Paulo`. Para outra porta, incluí-la na URL, por exemplo `https://erp.clinica.local:8443`. Usar nome DNS ou IPv4; IPv6 não é aceito por este preparador.

O arquivo fica acessível à conta Windows que executou o comando, SYSTEM e administradores. Executar o Docker/Compose com essa conta autorizada. O preparador exige um destino que permita aplicar essas permissões; uma falha de proteção interrompe a criação. Não publica o arquivo nem inicia containers.

**Se `.env` já existir, o comando interrompe sem alterar nada.** Isso também vale para arquivo vazio ou parcialmente preparado. O suporte deve inspecioná-lo localmente e ajustar apenas o necessário; não apagar configurações de uma instalação existente nem gerar novas chaves a cada atualização. Não compartilhar seu conteúdo em logs, prints ou Git.

Em seguida:

1. Provisionar certificado válido para o nome/IP escolhido e sua cadeia de confiança. Colocar `server.crt` e `server.key` em `TLS_DIRECTORY` (padrão `.data/tls/prod`). O responsável técnico deve emitir/renovar o certificado e instalar a confiança nas estações, conforme [HTTPS](./sessao-e-https.md). Não usar certificados/chaves da homologação. **A emissão assistida de produção ainda está pendente em P1.2B**; gerar `.env` não resolve essa parte.
2. Proteger chave privada e backups com acesso restrito. Nas estações distribuir apenas o certificado público da autoridade, quando necessário, nunca `server.key`.

## 5. Construir e iniciar — suporte, após configurar

Na pasta do projeto, **somente no servidor de destino**:

```powershell
docker compose --project-name erp-dents-prod --env-file .env -f docker-compose.yml config --quiet
docker compose --project-name erp-dents-prod --env-file .env -f docker-compose.yml up -d --build
docker compose --project-name erp-dents-prod --env-file .env -f docker-compose.yml ps -a
```

Parar se qualquer comando falhar. A construção inicial precisa de internet, inclusive para assinaturas do antivírus. A API aplica migrações ao iniciar. O serviço `exam-storage-init` terminar com código 0 é esperado; banco e antivírus precisam estar saudáveis. Conferir a URL e `/health` com HTTPS confiável, além do login; containers iniciados não comprovam funcionamento completo.

Preservar sempre o nome `erp-dents-prod` e seus volumes. Não executar `down -v`, limpeza de volumes ou restauração de fábrica do Docker. Não copiar banco/contas da homologação. Não executar estes comandos de produção neste computador de desenvolvimento para testar.

## 6. Criar o administrador e os usuários

1. Abrir a URL no navegador sem aviso de certificado.
2. Na configuração inicial, usar localmente o código `BOOTSTRAP_TOKEN` e criar o administrador com senha exclusiva. Não existe login de produção compartilhado a transportar deste desenvolvimento.
3. Criar uma conta por pessoa e atribuir apenas as permissões necessárias aos cadastros. Conferir o acesso com uma conta da recepção.
4. Guardar os acessos fora do repositório. Não enviar prints que mostrem o código de ativação ou senhas.

## 7. Preparar cada estação

1. Usar navegador atualizado; ensaios atuais do projeto usam Chrome.
2. Conferir a resolução do nome do servidor e instalar a confiança do certificado com o suporte, se necessária.
3. Abrir a mesma URL HTTPS, entrar com a conta individual e criar um atalho para essa URL na área de trabalho.
4. Testar cadastro fictício, busca, edição e reabertura em duas sessões. Não usar `localhost` nas estações: apontaria para a própria estação.

## 8. Liberar os cadastros reais — critérios pendentes

- [ ] Pacote de instalação ensaiado em homologação isolada, com dados fictícios.
- [ ] Backup coerente de banco, exames e configuração necessária; cópia guardada fora do disco do servidor.
- [ ] Restauração desse backup comprovada em ambiente isolado. Copiar só a pasta do código não salva os dados dos volumes.
- [ ] Fluxo de pacientes aprovado, incluindo busca acima de 100 registros, cadastro sem CPF e edição simultânea.
- [ ] Segundo computador acessa HTTPS, login individual e cadastro sem avisos/erros.
- [ ] Reinício completo do Windows testado, dados preservados e rotina de abertura do Docker definida.
- [ ] Responsável por backups, certificado e atualizações definido.

Backup/restauração assistidos e o ensaio de instalação ainda serão entregues em P1; busca/fluxo em P2. Por isso este roteiro não fornece um comando de restauração ainda não validado. Após esses aceites e a instalação física (P3), iniciar os cadastros reais.

## 9. Rotina e atualizações semanais

Usuário: ligar estação, abrir atalho e entrar. Se o servidor estiver desligado, todos ficam sem acesso. No encerramento, sair da conta.

Suporte: definir janela sem usuários gravando, fazer backup coerente recuperável, aplicar commit aprovado, manter projeto/volumes/configuração, conferir migrações e testar login/cadastro/busca antes de reabrir. A rotina executável de atualização e recuperação está prevista em P1/P4. Não fazer `git pull` seguido de atualização automática durante o atendimento. Reverter código não reverte migrações; nunca restaurar backup antigo por cima de cadastros novos sem avaliar a perda de dados.

## Problemas comuns

| Sintoma | Verificação inicial |
| --- | --- |
| Docker indisponível | Abrir Docker Desktop, aguardar engine Linux e executar `check-server.ps1` |
| Só abre no servidor | Conferir nome/IP, rede, firewall e URL na estação |
| Aviso de certificado | Conferir nome coberto, validade e confiança; corrigir sem ignorar o aviso |
| Login funciona, gravação falha | Conferir se a URL é exatamente `PUBLIC_ORIGIN`, inclusive porta |
| API não inicia | Conferir saúde do banco/ClamAV e migrações com suporte; preservar volumes |
| Falha após atualização | Interromper uso, preservar dados e seguir recuperação ensaiada |
