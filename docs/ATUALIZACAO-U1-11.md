# U1.11A — confirmação ao fechar cadastros não salvos

Iniciada em 20/10/2026, base `51f4fbb`. Instalação permanece `piloto-cadastros-v0.1.12` até concluir aceites.

## Diagnóstico e mudança

Dois testes reproduziram fechamento silencioso pelo Cancelar e ausência de proteção ao recarregar um formulário alterado. O teste de conflito existente continuou aprovado.

Cancelar, X e fundo do modal passam pelo mesmo fechamento: com alterações não salvas, solicitar confirmação; recusar mantém o formulário. Formulário intacto ou cujos valores voltaram ao original fecha sem aviso. Durante salvamento, o fechamento continua desabilitado. Resultado de criação desconhecido exibe mensagem própria: fechar não cancela a tentativa, e seu comprovante continua disponível.

Enquanto o formulário aberto tem alterações, operação em andamento ou criação sem confirmação, registrar `beforeunload` para solicitar aviso nativo ao recarregar/sair do documento. Remover o aviso quando desnecessário ou ao desmontar o formulário. Não armazenar campos no navegador, salvar automaticamente nem bloquear expiração/revogação da sessão.

## Limites e próximo recorte

- O navegador controla a mensagem e pode não exibi-la sem interação prévia; encerramento forçado, falha do computador ou perda de energia não são protegidos.
- Navegação interna pelo histórico, sem recarga do documento, **ainda não está protegida**. Será diagnosticada em U1.11B antes de modificar o roteamento.
- A ação explícita “Descartar rascunho e carregar atual” após conflito mantém seu comportamento.
- Sem migração, API ou configuração nova. Ensaio operacional de atualização anterior permanece identificado como U1.9; não foi repetido nesta subetapa.

## Correção de dependências identificada pelo CI

O CI `39535429544` e as novas execuções do commit de documentação v0.1.12 falharam na auditoria npm. A aprovação histórica da U1.10 continua sendo a execução `39473228288`; não representa auditorias futuras. A consulta atual detectou alertas em `vite` e `follow-redirects`. Atualizados Vite 7.3.6 → 7.3.7 e dependência transitiva follow-redirects 1.16.0 → 1.16.1, mantendo versões travadas no lockfile. Auditoria após instalação: zero vulnerabilidades. Referências: [follow-redirects](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8), [Vite/launch-editor](https://github.com/advisories/GHSA-587h-7wmj-h5pm). Reconstruir a imagem web; sem alteração de dependências da API ou imagens de infraestrutura.

## Evidências e retomada

- Antes: `.data/unsaved-before.log`, duas falhas esperadas e um teste anterior aprovado.
- Componentes: 54 testes em quatro arquivos aprovados (`.data/unsaved-focused.log`), incluindo confirmação recusada/aceita, valores restaurados e remoção do aviso após fechamento.
- Build TypeScript/Vite/imagem web aprovado (`.data/unsaved-build.log`).
- Em andamento: Chrome/API/SQL (`.data/unsaved-browser.log`) e frontend completo (`.data/unsaved-frontend.log`). CI ainda não iniciado para esta alteração.

Somente `erp-dents-homolog`, dados fictícios e recursos privados; containers principais e volumes preservados. P3 físico prioritário quando chegarem os dados do servidor.
