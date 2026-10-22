# U1.15 — recuperação da configuração inicial

Versão atual: `piloto-cadastros-v0.1.18`, liberada na subetapa B abaixo. A subetapa A foi o diagnóstico de 22/10/2026, base `2ccc847`, sem alteração funcional; naquela entrega a instalação permaneceu v0.1.17.

## Resultado

Em duas instalações vazias privadas, Chrome enviou a criação do administrador e o servidor respondeu 200, mas o teste abortou a entrega da resposta à interface.

- **Consulta de configuração disponível:** aparece falha de conexão; a consulta automática identifica instalação configurada e fecha o formulário. Não ocorre login automático. Entrar manualmente com o e-mail/senha criados funciona.
- **Consulta indisponível:** formulário de criação continua visível, junto do erro de consulta. Repetir explicitamente a criação recebe 409; não cria outro usuário. Restabelecer a consulta e recarregar a página fecha a configuração; login manual funciona.

A proteção de criação única funciona. A orientação da interface ainda não distingue resultado desconhecido de falha anterior à criação; o formulário pode continuar oferecendo criação quando a consulta está indisponível. Essa melhoria não está implementada nesta subetapa.

## Evidências e limites

- `.data/bootstrap-response-diagnosis-final.log`: dois cenários Chrome/API/SQL aprovados. Antes das verificações adicionais do harness, banco confirma um administrador, uma sessão do único login explícito e zero pacientes em cada cenário. Senha/código não encontrados em localStorage/sessionStorage; não foi testada eliminação da memória do formulário.
- Repetição da criação recusada, configuração continua fechada após reinício da API e mesmo após exclusão direta do usuário exclusivamente na base descartável. Recursos temporários removidos; volumes principais preservados.
- `smoke_bootstrap_response_homolog.py` e `.cjs` usam credenciais fictícias exclusivamente via stdin. O harness existente ganhou callback opcional anterior à criação e entrada opcional do navegador; comportamento padrão preservado.
- Primeira execução passou no cenário com consulta disponível, mas a automação do botão de consulta disputou com a atualização automática após o conflito. O ensaio final usa recarga explícita; não declara validado o clique em “Tentar novamente” nesse cenário.
- Simulação controlada com `route.fetch` concluindo a gravação e abortando sua resposta; não representa queda física da rede. As instalações estão vazias, sem concorrência real entre operadores nesta nova simulação. Concorrência do servidor permanece coberta pelo harness original.
- Sintaxe Node e diff conferidos. Suíte completa/build não repetidos: nenhum código do produto ou imagem mudou. Sem nova tag ou ensaio de atualização.
- Regressão do harness original aprovada (`.data/bootstrap-response-original-regression.log`), incluindo duas criações concorrentes com exatamente um administrador, ativação, login, reinício e limpeza. O callback opcional não substitui essa evidência de concorrência.

## Próxima U1.15B

Orientar resultado desconhecido na própria tela: conferir configuração explicitamente sem reenviar criação, informar quando já configurada sem afirmar quem criou a conta, permitir login manual e preservar nova tentativa se nenhuma criação foi confirmada. Cobrir falha antes do envio, resposta perdida, consulta indisponível, outra pessoa concluindo a configuração e descarte de dados sensíveis do formulário quando deixar de ser necessário. Não persistir código/senha, não reabrir bootstrap ou criar outro administrador para contornar erro. Componentes e Chrome/API/SQL antes de liberar. P3 físico prioritário quando chegarem dados do servidor.

## U1.15B — concluída em 22/10/2026, v0.1.18

Após falha de conexão ou erro 5xx, bloquear nova criação até **Conferir configuração** consultar o estado. A conferência faz apenas leitura e não reenvia código/senha; falha mantém o bloqueio e permite nova conferência. Se ainda disponível, liberar nova tentativa explícita. Se já configurada, fechar/resetar o formulário e orientar login com mensagem neutra, inclusive quando outra pessoa criou a conta. Conflito 409 também bloqueia enquanto a atualização do estado não confirmar o resultado.

Preservar login automático somente no fluxo com criação confirmada pela resposta original. Resultados desconhecidos não fazem login automaticamente. Alterar somente interface, sem API, migração, configuração ou dependência nova. Limpar a cópia da tentativa após término e removê-la do cache de mutações; resetar os campos quando a configuração fecha. Isso não é uma garantia de apagamento físico de bytes da memória JavaScript. Nada é persistido em localStorage/sessionStorage.

46 testes focados em três arquivos, 427 frontend em 48 arquivos (132,70 s), build/imagem e dois cenários de falha Chrome/API/SQL aprovados (`.data/bootstrap-recovery-components-final.log`, `.data/bootstrap-recovery-frontend.log`, `.data/bootstrap-recovery-image.log`, `.data/bootstrap-recovery-browser.log`). Fluxo normal de criação/login automático aprovado (`.data/bootstrap-recovery-normal.log`): a sessão é automática nesse cenário; o texto antigo do resumo SQL dizia “explicit” e foi corrigido no harness, sem alterar os asserts. Regressão de recuperação do login aprovada (`.data/bootstrap-recovery-login-regression.log`). Consulta indisponível coberta no navegador; falha anterior à criação e outro operador cobertos em componente.

Código `0e1ae16`; [CI 39834926871](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/39834926871) aprovado: 325 backend (512,916 s), 427 frontend, builds, HTTP e auditorias de pacotes/seis imagens sem achados. `.data/bootstrap-recovery-ci-final.log`. Versão de instalação `piloto-cadastros-v0.1.18`; guias atualizados. Sem alteração de implantação/esquema: ensaio operacional U1.14 não repetido; volumes/containers principais preservados. Próximo recorte: diagnosticar perda da resposta ao sair da conta, verificando revogação e proteção dos dados exibidos. P3 físico prioritário.
