# U1.13A — diagnóstico de resposta perdida no login

Concluído em 22/10/2026, base `ec3f053`. Diagnóstico e orientação operacional; versão de instalação permanece `piloto-cadastros-v0.1.15`. Nenhuma mudança funcional, migração ou atualização dos containers principais.

## Resultado reproduzido

O servidor autentica, mas a interface recebe falha de conexão e continua no login. Não há repetição automática. O botão fica disponível novamente.

- **Cookie ausente:** a consulta de sessão confirma ausência de acesso no navegador. Nova tentativa explícita autentica corretamente; a primeira sessão criada permanece no banco, sem credencial acessível nesse navegador.
- **Cookie recebido:** a API confirma a sessão e o usuário esperado, embora a interface ainda mostre falha. Recarregar a página valida a identidade e abre o painel sem outro POST de login.

O teste usa `route.fetch` para concluir autenticação real e aborta a resposta para a interface. O contexto de teste recebe o cookie; removê-lo simula perda antes dos cabeçalhos, preservá-lo simula perda do corpo após os cabeçalhos. Isso não equivale a desconectar fisicamente a rede. A consulta diagnóstica de sessão não altera o estado React da página.

## Evidências e limites

- Chrome/API: dois contextos novos, identidade conferida após recuperação; nenhuma repetição automática durante a observação e nenhuma senha nos armazenamentos locais.
- SQL privado: exatamente três sessões adicionais correspondentes aos três envios explícitos; um usuário original e zero pacientes. Reinício da API, bootstrap fechado e limpeza dos recursos privados aprovados; volumes preservados.
- Scripts `smoke_login_response_homolog.py` e `.cjs`; log local `.data/login-response-diagnosis-final.log`. Sintaxe Node e `git diff --check` aprovados.
- Primeira execução do harness falhou na conferência de `/auth/me` por ausência do cabeçalho de identificação exigido pela API. Harness corrigido e ensaio completo repetido com sucesso; não foi defeito do produto.
- Sem alteração do produto: suíte completa/build/ensaio operacional de atualização não repetidos. Evidências anteriores da v0.1.15 continuam descritas na U1.12. Não há nova tag de instalação nesta subetapa.
- Não cobre troca entre dois usuários, resposta atrasada, falha de consulta de sessão ou perda de resposta na configuração inicial. Não declarar esses casos resolvidos.

## Próxima subetapa U1.13B

Melhorar a orientação e recuperação do resultado desconhecido na tela de login. Antes de adotar uma sessão encontrada, cobrir identidade diferente da tentativa, cookie antigo, outra aba e falha de consulta. Não reenviar senha automaticamente nem persistir credenciais. Validar componentes, Chrome/API/SQL e regressões de sessão antes de liberar alteração funcional. Instalação física P3 tem prioridade quando chegarem os dados do computador.

## U1.13B — concluída em 22/10/2026, v0.1.16

Após falha de conexão, a tela oferece **Conferir acesso**. O clique faz apenas GET de sessão, sob a mesma trava usada entre abas no login. A conta precisa corresponder ao e-mail da tentativa; resposta de contexto alterado é descartada. Uma sessão válida anterior da mesma conta também pode ser recuperada: não se afirma que ela foi criada pela última tentativa. Ausência de sessão e conta diferente orientam login explícito; falha na consulta permite tentar a conferência novamente. Senha incorreta não oferece recuperação. Nenhuma senha adicional é armazenada ou reenviada pela conferência.

Sem alteração de API, migração ou configuração. A conferência não revoga cookies de outra conta e não interfere no encerramento de acesso. Ainda não cobre resposta perdida na criação do administrador inicial. Versão de instalação: `piloto-cadastros-v0.1.16`.

O CI inicial `39782853003` recusou a auditoria npm: Vitest 4.1.11 contém os alertas [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) e [GHSA-xp26-3454-mjgp](https://github.com/advisories/GHSA-xp26-3454-mjgp), com correção indicada em 4.1.12. A dependência de testes e seu lockfile foram atualizados; auditoria local sem achados. Não altera dependências da aplicação em execução.

Validações locais: 43 focados em três arquivos após proteção de edição do e-mail; 424 frontend em 48 arquivos também com Vitest 4.1.12, em 144,59 s (`.data/login-recovery-frontend-final.log`); builds aprovados, inclusive imagem com lockfile corrigido (`.data/login-recovery-patched-build.log`). Chrome/API/SQL final (`.data/login-recovery-release-browser.log`) e regressão de revogação/troca de sessão (`.data/login-recovery-session.log`) aprovados. Identidade diferente/cookie antigo e troca entre abas na conferência cobertos em componente; não confundir com ensaio integrado de duas identidades nessa operação. Primeiro ensaio do botão precisou sincronizar o harness com a falha efetiva da consulta antes de remover a interceptação; ensaio final passou. Não foi necessária outra mudança funcional para esse ajuste de teste.

Código `d65d3c4` (funcional `06523ef`). [CI 39783161729](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/39783161729) aprovado: 325 backend (743,750 s), 424 frontend, builds, HTTP e auditoria de pacotes sem achados. Log `.data/login-recovery-ci-final.log`. Guias/rotina atualizados para v0.1.16. Ensaio operacional U1.9 não repetido: sem alteração de implantação ou esquema; dados/volumes principais preservados.

**Ressalva das imagens:** CI e auditoria local (`.data/login-recovery-image-audit.log`) registram duas ocorrências `UNKNOWN` por imagem, ambas `CVE-2026-107891`, pacotes `musl`/`musl-utils` 1.2.6-r2; scanner indica versão corrigida 1.2.6-r3, sem descrição/severidade disponível no relatório. Zero HIGH/CRITICAL; aprovado pelo critério existente de `scripts/audit_images.py`, mas não é uma auditoria sem achados. Não inferir baixo risco da falta de classificação. Próxima prioridade técnica: atualizar esses pacotes nas seis imagens e homologar infraestrutura, antes de voltar ao diagnóstico de resposta perdida na configuração inicial. Instalação física P3 continua prioritária quando chegarem os dados do servidor.
