# Homologação 2B.7.2 — disponibilidade e consultas na mesma transação

**Concluída em 26/09/2026**, base `d207e5c`, implementação `6dbf767` e ajuste de testes `6170ee0`. Usuário escolheu bloquear redução de horários/inativação incompatível até reagendamento/cancelamento explícito. Nenhuma migração.

## Contrato implementado

- Reserva adquire `FOR SHARE` dos dentistas por UUID, relê a disponibilidade e valida antes de gravar. Atualização adquire depois o lock da consulta e confere versão/dentista original. Entidades antigas do ORM são atualizadas; falhas fazem rollback de campos, versão e procedimentos.
- Alteração do dentista adquire bloqueio exclusivo e verifica `scheduled`/`confirmed` com fim posterior ao instante da verificação, incluindo consultas em andamento. Se incompatível, responde 409 `availability_conflict` sem dados de pacientes. Cancelados/concluídos e histórico encerrado não impedem mudança; não há alteração automática de consultas.
- Campos de contato/nome/cor e disponibilidade efetivamente igual não ficam bloqueados por incompatibilidade legada. Ordem dos intervalos/duplicatas não muda a disponibilidade efetiva. Sem união automática de turnos.
- Consulta: observações/procedimentos e confirmação/conclusão sem mudar paciente, dentista ou horários são manutenção. Cancelamento continua permitido. Mudança dessas referências/horários ou reabertura de cancelada/concluída exige validar nova reserva. Cancelada→concluída também valida, pois volta a ocupar a agenda. Constraints de sobreposição permanecem.
- Lista/calendário/dentistas distinguem conflito de disponibilidade de versão. Rascunho mantido, atualização de referências explícita, falha de recarga mantém envio bloqueado. Recarga bem-sucedida pede revisão e não salva automaticamente.
- Bloqueios por dentista, sem mutex em memória/global. Financeiro mantém seus bloqueios `FOR SHARE NOWAIT`; testes de integração e regressão ainda pendentes.

## Validação e retomada

- Build inicial aprovado; cinco testes focados frontend aprovados em 44,15s, incluindo lista/calendário com recarga falhando e rascunho intacto e regressão de versões.
- Novos testes PostgreSQL cobrem seis interleavings nas duas ordens; espera observada com `pg_blocking_pids`, relógio controlado, histórico, ORM antigo, versão/procedimentos e movimentos opostos. Suíte focada aprovada, resultados abaixo.
- Build final, HTTP/permissões, Chrome privado em duas abas, atualização/preservação, publicação e CI final aprovados. Cópias preparadas pelo helper local `.data/upgrade_2b72.py`, sem remover volumes. Logs/cópias/credenciais ficam fora do Git.

## Resultados locais antes da publicação

- 46 backend focados em 293,324s; oito finais em 46,541s; dois complementos em 20,112s, todos aprovados. Complementos verificam alteração compatível que aguarda e depois confirma e barreira entre movimentos opostos com ambos os locks adquiridos. Regressão financeira/exclusões completa validada no CI final.
- Quatro casos finais de frontend em 12,53s, criação/edição na lista/calendário: conflito preserva rascunho, 503 na recarga mantém bloqueio, recarga bem-sucedida libera revisão sem reenviar automaticamente. Cinco focados anteriores também aprovados. Builds API/web aprovados.
- HTTP privado aprovado: nove grupos, incluindo rollback de campos/versão, manutenção clínica, cancelamento/reabertura, permissões e ausência de informações de paciente no erro. Espera de prontidão do harness passou de 10s para 30s após falha de inicialização em duas tentativas; repetição concluída com sucesso.
- Chrome HTTPS privado em duas abas aprovado; capturas conferidas. Dentista bloqueado, cancelamento explícito, mudança aceita, reativação recusada, recarga falhando mantém rascunho e revisão compatível confirmada. Primeira tentativa esperava mensagem bruta do 503; aplicação a sanitiza corretamente, teste ajustado e repetido. Calendário validado em componentes, sem novo Chrome do calendário neste recorte.
- Credenciais/capturas/logs/cópias locais, nunca publicados. Implementação `6dbf767` e ajuste `6170ee0` publicados, HEAD remoto conferido. Primeira execução do CI teve dois testes a adaptar, descritos abaixo; execução final aprovada.

## Atualização da homologação principal

- Cópias públicas/exames/fingerprints/dump completo `pre-2B7-2*` salvas localmente, dump completo após zero schemas descartáveis. API/web atualizados juntos, sem migração, revisão `0022_dentist_user_restrict` mantida.
- Dez verificações gerais aprovadas e comparação integral confirmou linhas de negócio/histórico e bytes dos exames preservados; zero schemas descartáveis e nenhum volume removido. Acesso em **https://localhost:18443**; recarregar abas antigas.
- HTTP anterior de fronteiras/legado também aprovado com o novo contrato 409 de disponibilidade (dez grupos). Calendário não recebeu nova validação em navegador nesta entrega; criação/edição/recarga foram verificadas em componentes.

## Limites

- Coordenação implementada nos repositórios usados pela aplicação, em PostgreSQL com isolamento READ COMMITTED. Escritas SQL externas que não seguem esse protocolo não recebem essa garantia; não foi instalado trigger de disponibilidade. Dados históricos não são corrigidos automaticamente.
- Não implementa férias/exceções por data, união de turnos, atualização automática entre computadores nem auditoria clínica completa. Horário/fuso seguem a convenção existente. Testes determinísticos de concorrência não substituem ensaio de carga de produção.

## Primeira regressão completa

CI `36235435073` não aprovado: 262 backend em 479,207s, dois erros de expectativa nos testes de exclusão. A releitura sob lock identifica dentista removido e retorna NotFoundError antes do antigo erro 23503 de FK. Ajustados os testes para esse contrato, verificando rollback automático e nenhum órfão; fixture da disputa passou a ter disponibilidade válida. Código executável da aplicação não alterado por esse ajuste. Revalidação focada e CI final concluídos conforme registros abaixo.

Dois casos adaptados aprovados em 13,397s; ajuste somente de testes/documentação publicado em `6170ee0`. Não exigiu outra alteração funcional nem novo reinício da principal.

## Regressão final e próximo passo

- [CI 36236034979](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/36236034979) aprovado em **13min15s**: **262 backend em 446,819s e 106 frontend**, builds, regressão HTTP, dependências e seis imagens sem achados nessa execução. Inclui financeiro/referências/exclusões; a regressão completa não foi duplicada localmente.
- Gateway: 413/503, JSON 408 em 30,007s, vagas liberadas e 80 chamadas de saúde com p95 de 0,0254s. HTTPS principal respondeu 200 com CA local e verificação normal de certificado/hostname via Python. Curl/Schannel não concluiu sua checagem de revogação da CA privada; não foi desabilitada a validação TLS para contornar isso.
- Próximo recorte: **preparação 2B.8 — concorrência em usuários/permissões**. Mapear edição/exclusão/formulários antigos, sessão e último administrador; reproduzir antes de implementar. A decisão de negócio da 2B.7 está resolvida e não deve ser reapresentada. R18 permanece parcial para a administração; instalação assistida continua em etapa própria.
