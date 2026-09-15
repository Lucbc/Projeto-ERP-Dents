# Trabalho neste projeto

- Antes de continuar correções, leia `docs/PLANO-DE-EXECUCAO.md`, especialmente o ponto de retomada.
- Trabalhe em subetapas pequenas. Registre início, mudanças, validação, pendências e próximo passo no plano.
- Uma subetapa só está concluída quando seus critérios de aceite estiverem verificados; diferencie teste de API, banco e interface.
- Use `erp-dents-homolog` para testes integrados e dados exclusivamente fictícios. Não use volumes de produção/desenvolvimento nem de outros projetos para homologação.
- Nunca registre senhas, tokens, conteúdo de `.env` ou dados de pacientes em commits, logs de testes ou relatórios.
- Preserve os dados durante reinícios e atualizações. Não remova volumes para contornar erros de migração.
- Comunique mudanças de etapa ao usuário e mantenha um ponto de retomada suficiente para outra sessão continuar sem repetir a revisão inteira.
- Ao concluir alterações, faça commit e push para o remoto configurado, conforme autorização permanente do usuário. Confira os arquivos e exclua segredos/dados locais antes de publicar. Verifique que o HEAD local corresponde ao remoto; se o push falhar, informe o bloqueio e preserve o commit para retomada. Não use force push.
