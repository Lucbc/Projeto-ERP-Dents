# U1.15A — resposta perdida na configuração inicial

Diagnóstico de 22/10/2026, base `2ccc847`. Sem alteração funcional ou nova versão de instalação; permanece `piloto-cadastros-v0.1.17`.

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
