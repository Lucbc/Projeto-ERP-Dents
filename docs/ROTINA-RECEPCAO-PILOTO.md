# Rotina da recepção — piloto de cadastros

## Entrar

1. Abrir o atalho do ERP no navegador e entrar com sua conta individual.
2. Se não abrir, avisar o responsável pelo servidor. Se aparecer aviso de certificado, pedir suporte antes de prosseguir.
3. Se aparecer “Sem conexão. Nada foi enfileirado”, restabelecer a conexão e clicar novamente em **Entrar**. Voltar a ter rede não envia o login automaticamente. Se o servidor continuar inacessível, avisar o suporte; não é necessário criar outra conta.

## Antes de cadastrar

1. Procurar pelo nome completo, nome social/preferido ou CPF. O CPF pode ser digitado com ou sem pontuação.
2. Conferir os dados encontrados para evitar duplicidade. A lista tem até 100 resultados por página; usar **Próxima página** quando necessário.
3. O telefone também pode ser pesquisado com ou sem pontuação, inclusive por um trecho do número. Nome completo e nome social podem ser buscados com ou sem acentos: Joao encontra João. Confira nascimento e demais dados antes de criar outro registro.

## Cadastrar e conferir

1. Se não encontrar o paciente, clicar em **Novo** e preencher os dados disponíveis. É possível cadastrar sem CPF; não inventar informações ausentes.
2. Conferir nome, nascimento e contatos, salvar e verificar o registro na lista.
3. Se houver erro ou dúvida sobre o salvamento, procurar o registro antes de tentar criar novamente. Evitar cadastros duplicados.

Na versão v0.1.7, o formulário **Novo** confere possíveis duplicidades ao informar CPF completo ou nome completo e nascimento. Aguarde a conferência e confira os nomes, nascimentos e a situação dos registros encontrados, inclusive inativos. Se já for a mesma pessoa, feche o novo cadastro e localize o existente na lista; anote antes qualquer informação que precisar preservar. Se a coincidência for somente de nome e nascimento e for outra pessoa, pode continuar e salvar.

Ao salvar um cadastro novo ou alterar seu CPF, o sistema bloqueia CPF completo já usado, inclusive em cadastro inativo. O rascunho permanece disponível: confira o cadastro existente ou corrija o CPF e tente novamente. Não invente CPF; cadastro sem CPF continua permitido. Duplicidades antigas não são apagadas nem unidas, e seus outros dados continuam editáveis quando o CPF é mantido.

O aviso antecipado aparece somente no formulário Novo; o bloqueio ao salvar também vale na edição. Nenhuma correspondência não garante que a pessoa seja nova. Se a conferência falhar, use **Tentar conferir novamente** ou pesquise na lista antes de salvar.

Na v0.1.8, CPF novo ou alterado precisa ter 11 dígitos e passar pela conferência dos dígitos verificadores. Se aparecer **CPF inválido**, confira o documento ou deixe o campo em branco; não invente um número. O texto e os demais dados digitados permanecem no formulário para correção. Essa conferência não consulta a Receita Federal nem comprova titularidade. Documentos antigos mantidos não impedem corrigir contato ou outros dados; nenhuma correção automática é aplicada ao histórico.

## Editar

Na v0.1.10, o RG mantém letras, pontuação e conteúdo longo durante a digitação, sem corte automático. Confira o documento antes de salvar; o sistema não verifica sua autenticidade. O campo continua opcional.

Na v0.1.9, nascimento novo ou alterado não pode estar no futuro, considerando o dia da clínica em São Paulo. Se houver erro, confira a data ou deixe o campo em branco; os demais dados digitados permanecem disponíveis. Uma data antiga mantida não impede editar outros campos. Não invente datas para preencher informação desconhecida.

Abrir o cadastro correto, alterar e salvar. Se o sistema avisar que outra pessoa alterou o mesmo registro, conferir a mudança e carregar a versão atual antes de salvar novamente. Copiar ou anotar o que precisa preservar antes de escolher descartar o rascunho.

## Encerrar e pedir ajuda

### Fechar ou recarregar durante preenchimento

Na v0.1.13, Cancelar, X ou clique fora de um formulário alterado pedem confirmação. Recusar mantém os campos; confirmar fecha o formulário. Se o cadastro foi enviado sem confirmação de resultado, fechar não cancela o envio: confira a tentativa antes de repetir os dados.

Ao recarregar ou fechar a aba com formulário pendente, o navegador pode perguntar se deseja sair. Escolha permanecer para continuar e salvar. Não há recuperação automática de campos após sair, falha do computador ou expiração.

Na v0.1.14, ao usar Voltar/Avançar dentro do sistema com cadastro pendente, escolha **Continuar preenchendo** para manter os campos ou **Descartar e sair** para seguir a navegação. Escape mantém o preenchimento. Durante uma operação em andamento, aguarde sua conclusão. Se o resultado do cadastro for desconhecido, sair não cancela o envio: ao voltar, confira a tentativa antes de repetir os dados. A confirmação não prolonga a sessão nem impede o encerramento do acesso.

### Aviso de fim da sessão

Na v0.1.12, um aviso aparece nos últimos cinco minutos do acesso. Salve o cadastro enquanto a sessão estiver válida. **Ocultar aviso** apenas fecha a mensagem; não renova a sessão.

Ao expirar, o sistema volta ao login e descarta campos não salvos. Eles não reaparecem após entrar novamente. Se havia um salvamento sem confirmação, consulte o paciente antes de criar outra tentativa. Não deixe o preenchimento de um cadastro longo para o fim da sessão.

### Se a conexão falhar durante o salvamento

Na v0.1.11, se não houver conexão antes de salvar, o sistema mantém o rascunho e não enfileira o envio. Quando a conexão voltar, clique em Salvar.

Se a conexão cair durante a criação, o resultado pode ser desconhecido. Use **Conferir resultado do cadastro** ou **Retomar tentativa**. Salvar novamente nessa mesma tentativa recupera o registro já criado, sem criar outro. Enquanto não houver confirmação, os dados originais da tentativa ficam preservados; depois, corrija o cadastro pela edição.

Após recarregar a página, ainda é possível conferir o resultado na mesma aba e login, mas os campos que não chegaram ao servidor não são recuperados. Ao trocar de aba, navegador, computador ou login, consulte antes de iniciar outro cadastro com os mesmos dados. A proteção não une cadastros independentes por nome. Não exclua possíveis duplicados por conta própria.

Na edição com resultado desconhecido, preserve o rascunho e confira o registro atual antes de escolher **Descartar rascunho e carregar atual**. Esse botão substitui os campos pelo que está no servidor. Se faltarem permissões para conferir, peça ajuda ao responsável. [Detalhes U1.9](./ATUALIZACAO-U1-9.md).

- Sair da conta ao terminar ou trocar de operador. Não compartilhar senha nem usar a conta administradora para digitação.
- Durante backup/atualização, aguardar a liberação do suporte. A página pode continuar visível mesmo com as gravações indisponíveis.
- Ao relatar um problema, informar horário, ação e mensagem de erro. Não enviar senha ou captura com dados de pacientes.
- Neste piloto, usar somente cadastro, consulta e edição de pacientes. Não iniciar agenda, financeiro ou prontuário sem liberação específica.
