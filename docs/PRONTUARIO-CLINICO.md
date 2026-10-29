# Prontuário clínico — guia de uso

**Incluído na v0.1.25, com acesso inicialmente negado.** O início dos cadastros não depende de habilitar o prontuário. Usar este guia quando o responsável decidir iniciar o fluxo clínico e configurar os acessos. Conferir as [notas da versão](./ATUALIZACAO-PRONTUARIO-V25.md).

## Acesso

O responsável configura o recurso **Prontuário clínico** na tela de permissões por perfil. Os acessos começam negados, inclusive para administrador. Permitir leitura não concede escrita. Para registrar atendimento, o usuário precisa ser dentista, estar vinculado ao dentista cadastrado e ter as permissões de leitura/criação/alteração correspondentes.

Somente o autor pode alterar seu rascunho, finalizar sua evolução e acrescentar adendos ao próprio registro. Outro profissional com leitura pode consultar o histórico, mas não escrever em nome do autor. Não compartilhar logins.

Alergias e histórico médico já existentes no cadastro continuam sujeitos às permissões de pacientes/Consulta. A permissão do novo prontuário não altera o acesso a esses campos antigos.

## Registrar um atendimento

1. Localizar o paciente e abrir **Prontuário**. Conferir a identificação e o contexto atual, especialmente alergias e histórico. “Não informado” significa ausência de informação no cadastro, não ausência de alergias.
2. Em **Consulta vinculada**, selecionar a consulta correta e conferir paciente, dentista e horário. Essa seleção exige acesso à agenda e apresenta consultas do dentista vinculado ao usuário. Se já existir evolução para a consulta, ela será reaberta.
3. Clicar em **Abrir atendimento da consulta**, escrever em **Evolução clínica** e escolher **Salvar rascunho**. Abrir a tela, por si só, não grava uma evolução.
4. Aguardar a confirmação. O rascunho salvo pode ser reaberto pelo histórico em **Editar rascunho**.
5. Quando o texto salvo estiver conferido, escolher **Finalizar evolução** e confirmar. Se houver texto ainda não salvo, salvar primeiro.

A finalização preserva texto, autoria, instante e o contexto de alergias/histórico registrado naquele momento. Alterações posteriores no cadastro não reescrevem esse contexto. A finalização clínica não muda automaticamente o estado da agenda nem gera cobrança.

## Corrigir depois de finalizar

Abrir **Adicionar adendo**, escrever a correção em **Texto do adendo**, informar o **Motivo do adendo** e escolher **Registrar adendo**. Aguardar a confirmação. O original continua preservado, e a correção aparece separadamente com autor e data. Não existe exclusão comum de evolução/adendo nessa entrega.

## Quando ocorrer um problema

| Situação | Como proceder |
| --- | --- |
| Falha de conexão ou resultado não confirmado | Manter a tela aberta e usar **Recuperar tentativa** após restabelecer o acesso. A tela bloqueia outra gravação até confirmar o resultado. Não abrir outro atendimento para repetir a mesma operação |
| Outra aba alterou o registro | O texto local é preservado. Conferir o que foi digitado antes de escolher **Descartar texto local e carregar versão atual**; essa ação substitui o texto local pelo salvo no servidor |
| Consulta mudou de paciente/dentista | Conferir a agenda e abrir o atendimento correto. O sistema bloqueia a criação usando a seleção anterior |
| Permissão de escrita foi retirada | O texto fica preservado na tela, mas não pode ser salvo. Solicitar revisão do acesso ao responsável |
| Permissão de leitura ou sessão encerrada | O conteúdo é ocultado. Entrar novamente ou solicitar revisão do acesso; texto não salvo pode não ser recuperado |

**Salvar regularmente.** Texto ainda não salvo e tentativa aguardando confirmação permanecem apenas na memória da aba. O aviso de saída ajuda a evitar perda, mas não recupera texto após fechar à força o navegador ou desligar o computador. Não copiar informações clínicas para arquivos desprotegidos como alternativa ao salvamento.

## Operação e manutenção

O suporte deve incluir prontuários e exames no backup completo e testar a restauração em destino separado. Depois de existirem registros clínicos, não tentar voltar a uma versão anterior apagando tabelas ou executando downgrade. Atualizações precisam seguir as notas da versão liberada e preservar os volumes.

Este primeiro fluxo não inclui odontograma, prescrição, assinatura documental ou plano de tratamento. O texto finalizado do atendimento e seus adendos são o escopo desta entrega.
