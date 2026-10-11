# Etapa 3A.3.7.2 — especialidades no formulário de dentistas

Em validação, iniciada em 11/10/2026, base `ca48fd2`. [Contrato e recortes](./plano-etapa-3A-3-7.md). Sem alteração de API/schema.

## Implementação

- Cada criação/edição prepara especialidades atuais; nenhuma leitura ociosa ou atualização automática das opções durante o rascunho. Atualização explícita conserva nome, especialidade, horários e versão capturada.
- Especialidade é texto histórico: nome ausente permanece selecionado e identificado como fora do cadastro atual. Inativas são identificadas. Não há troca automática nem nova regra de integridade no servidor.
- Erro e negação têm mensagens próprias e bloqueiam envio até recuperação. Permissão de especialidades permanece independente da de dentistas.
- Protocolo de referências extraído para hook compartilhado com usuários, preservando cancelamento e proteção contra respostas tardias. Paginação de especialidades recebe AbortSignal e não aceita resultado parcial.
- Revisão de disponibilidade e bloqueio de alterações que afetem consultas futuras permanecem; atualizar opções não libera conflito nem renova versão.

## Validação e retomada

- Sete novos testes de referências e regressões de disponibilidade aprovados no ensaio focado (12 testes). Testes antigos ajustados para esperar preparação antes de preencher/salvar, sem remover provas de conflitos e horários.
- Auditorias npm/Python aprovadas; imagem web construída e seis imagens sem achados. Backups `pre-3A-3-7-2*` preservados; helper local somente `after`.
- Suíte completa/build final e Chrome com sessões independentes em execução. Pendentes: regressão Chrome de disponibilidade, atualização somente web/HTTPS/preservação, CI e fechamento documental. Não declarar etapa concluída antes desses aceites.
- Logs e capturas ficam em `.data` ignorada, com fixtures exclusivamente fictícias em schemas privados de `erp-dents-homolog`. Nenhuma credencial publicada.

Próximo após aceite: 3A.3.7.3, referências em agenda/calendário. R19 parcial; instalação assistida na etapa 5.
