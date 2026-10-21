# U1.12 — envio offline no login e na configuração inicial

Iniciada em 21/10/2026, base `80e027a`. Implementação em validação; instalação permanece `piloto-cadastros-v0.1.14` até aceites.

## Diagnóstico

Dois testes de componente reproduziram ausência de orientação/fila offline no login e no cadastro do administrador inicial (`.data/login-offline-before.log`). Chrome com API privada confirmou: clicar Entrar offline deixava o botão em “Entrando...” e, ao reconectar, o sistema autenticava sem novo clique. SQL confirmou uma sessão adicional, sem novos usuários/pacientes. `.data/login-offline-diagnosis.log`.

## Correção e limites

Recusar envio quando o navegador identifica ausência de conexão, com mensagem de que nada foi enfileirado e que é preciso clicar novamente após reconectar. Login e configuração inicial usam mutações sem pausa/fila de rede nem repetição automática. Se a conexão cair entre a verificação e o envio, a requisição pode falhar normalmente; não fica aguardando reconexão para executar sozinha. Enquanto a operação está pendente, o botão permanece desabilitado.

Campos continuam somente na memória do formulário; nenhuma persistência de credenciais acrescentada. Cookies, CSRF, limites de acesso, autorização e expiração permanecem iguais. Sem API, migração, configuração ou dependência nova. Reconstruir somente a interface é suficiente em relação à v0.1.14; o roteiro operacional continua abrangendo versões anteriores.

Esta subetapa cobre envio iniciado offline e falha de conexão no desafio anterior ao login. Perda da resposta depois de o servidor autenticar exige diagnóstico próprio; não considerar essa situação resolvida por impedir a fila offline. O envio já recebido pelo servidor não é cancelado pela queda de conexão.

## Evidências e retomada

- 35 testes focados de configuração inicial/sessão aprovados (`.data/login-offline-components.log`): envio offline recusado nos dois formulários, reconexão sem operação automática e novo envio explícito permitido.
- Build TypeScript/Vite/imagem web aprovado (`.data/login-offline-build.log`).
- Em andamento: Chrome/API/SQL (`.data/login-offline-browser.log`) e frontend completo (`.data/login-offline-frontend.log`).
- Bootstrap offline validado em componente; o ensaio integrado usa instalação já inicializada. Não confundir essas evidências.
- Somente recursos privados de `erp-dents-homolog`, dados fictícios, sem alteração principal ou remoção de volumes. Ensaio operacional U1.9 não repetido, pois não há mudança em implantação/esquema.

Após aceites locais, executar CI e atualizar guias/rotina/tag. Próximo recorte: resposta de login perdida depois da autenticação e recuperação sem confundir a identidade. P3 físico prioritário quando chegarem os dados do servidor da clínica.
