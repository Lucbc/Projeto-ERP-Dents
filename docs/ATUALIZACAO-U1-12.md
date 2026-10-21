# U1.12 — envio offline no login e na configuração inicial

Concluída em 21/10/2026, base `80e027a`, código `216921f`. Versão de instalação: `piloto-cadastros-v0.1.15`.

## Diagnóstico

Dois testes de componente reproduziram ausência de orientação/fila offline no login e no cadastro do administrador inicial (`.data/login-offline-before.log`). Chrome com API privada confirmou: clicar Entrar offline deixava o botão em “Entrando...” e, ao reconectar, o sistema autenticava sem novo clique. SQL confirmou uma sessão adicional, sem novos usuários/pacientes. `.data/login-offline-diagnosis.log`.

## Correção e limites

Recusar envio quando o navegador identifica ausência de conexão, com mensagem de que nada foi enfileirado e que é preciso clicar novamente após reconectar. Login e configuração inicial usam mutações sem pausa/fila de rede nem repetição automática. Se a conexão cair entre a verificação e o envio, a requisição pode falhar normalmente; não fica aguardando reconexão para executar sozinha. Enquanto a operação está pendente, o botão permanece desabilitado.

Campos continuam somente na memória do formulário; nenhuma persistência de credenciais acrescentada. Cookies, CSRF, limites de acesso, autorização e expiração permanecem iguais. Sem API, migração, configuração ou dependência nova. Reconstruir somente a interface é suficiente em relação à v0.1.14; o roteiro operacional continua abrangendo versões anteriores.

Esta subetapa cobre envio iniciado offline e falha de conexão no desafio anterior ao login. Perda da resposta depois de o servidor autenticar exige diagnóstico próprio; não considerar essa situação resolvida por impedir a fila offline. O envio já recebido pelo servidor não é cancelado pela queda de conexão.

## Evidências e retomada

- 35 testes focados de configuração inicial/sessão aprovados (`.data/login-offline-components.log`): envio offline recusado nos dois formulários, reconexão sem operação automática e novo envio explícito permitido.
- Build TypeScript/Vite/imagem web aprovado (`.data/login-offline-build.log`).
- Chrome/API/SQL aprovado (`.data/login-offline-browser.log`): reconexão sem autenticação automática, falha no desafio mantém nova tentativa disponível, apenas envio explícito autentica. SQL confirma uma sessão adicional, usuário original e ausência de pacientes.
- Frontend completo aprovado: 416 testes em 47 arquivos, 120,04 s (`.data/login-offline-frontend.log`). Regressão de navegação/troca de sessão/revogação aprovada (`.data/login-offline-session.log`), incluindo cancelamento de requisição antiga e isolamento entre identidades.
- Código `216921f`; [CI 39643106919](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/39643106919) aprovado: 325 testes backend, 416 frontend, builds, HTTP e auditorias de pacotes/seis imagens sem achados. Log local `.data/login-offline-ci-final.log`. Guias e rotina atualizados para v0.1.15.
- Bootstrap offline validado em componente; o ensaio integrado usa instalação já inicializada. Não confundir essas evidências.
- Somente recursos privados de `erp-dents-homolog`, dados fictícios, sem alteração principal ou remoção de volumes. Ensaio operacional U1.9 não repetido, pois não há mudança em implantação/esquema.

Aceites desta subetapa concluídos. Próximo recorte: diagnosticar resposta de login perdida depois da autenticação e recuperação sem confundir a identidade. P3 físico prioritário quando chegarem os dados do servidor da clínica.
