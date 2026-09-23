# 2B.6.2.1 — exclusão concorrente de consultas

**Concluída em 23/09/2026.** Implementação `cc910cb`, base `203bcf6`. [Contrato](./plano-etapa-2B6-2.md). [CI 35904115803](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35904115803) aprovado: **209 backend e 76 frontend**, HTTP, builds e auditorias.

## Mudanças

- DELETE de consulta exige `?version=N` positiva: 422 ausente/inválida, 404 ausente, 409 `stale_version` alterada. Bloqueio e recarga do estado precedem comparação e remoção dos procedimentos associados; falha reverte a transação.
- A confirmação identifica paciente/data/horário salvos e captura ID/versão exibidos. Avisa que excluir não cancela cobranças/pagamentos. Não consulta nem revela financeiro ao operador sem essa permissão.
- Lista exige recarga e nova confirmação após erro. Calendário preserva rascunho e explica que ele não será aplicado pela exclusão; recarga que substitui campos é explícita. Atualizar somente a agenda não remove a exigência de revisar a consulta. Fechar/reabrir registro em cache também não contorna o bloqueio.
- Falha de rede/5xx é incerta, sem reenvio automático. Ausência no calendário permite fechar/atualizar, sem atribuir a exclusão a alguém. Durante envio, não se troca o formulário por outra consulta. Sucesso invalida caches de agenda e financeiro.
- Permissões e política clínica mantidas, inclusive consultas concluídas/canceladas. FK atual do financeiro fica nula; valores, status, versões, pagamentos, estornos, capturas e recibos permanecem. Geração com chave confirmada recupera a cobrança após exclusão; nova chave exige consulta existente.
- Sem migração: revisão continua `0021_financial_references`. Atualizar API/web juntos; clientes antigos sem versão recebem 422 e precisam recarregar a página.

## Evidências por camada

- **Banco:** sete testes finais aprovados em 23,568s, com conexões independentes e barreiras. PUT × DELETE e DELETE × DELETE; estado ORM antigo; preservação de links/horário em falha; estados clínicos; criação manual/geração pendente/paga antes e depois da exclusão; baixa com ordem inversa de bloqueios retorna conflito seguro e não deixa evento/recibo parcial. Pagamento posterior pode ter referência atual nula, conservando a origem.
- Testes iniciais precisaram de correção no ponto de interceptação da criação paga, argumento de request ID e formato de referência ausente (`id`/`start_at` nulos). A rodada anterior de 17 casos aprovou 16 e falhou nessa última expectativa; sete novos casos finais passaram integralmente.
- **Interface:** 76 testes aprovados. Versão/identidade da confirmação, cancelamento, erro/recarga, rede/404/503, preservação do rascunho, troca de contexto bloqueada e reabertura de consulta em cache. Corrigida inscrição no `isDirty` identificada pela primeira rodada. Builds API/web aprovados.
- **API HTTP:** dez grupos incluindo preparação/limpeza. Versão obrigatória, consulta alterada/ausente, usuário autorizado a excluir sem acesso financeiro, revogação na sessão existente, cobrança pendente/paga preservada e repetição por chave.
- **Chrome HTTPS:** lista/calendário em duas abas com reagendamento; exclusão antiga rejeitada, rascunho diferente do salvo mantido, recarga e nova confirmação; ausência após exclusão em outra aba; financeiro/histórico conferidos por API autorizada. Capturas `appointment-deletion-calendar.png` e `appointment-deletion-list.png` conferidas.
- Dados fictícios em schemas/API/web descartáveis exclusivos de `erp-dents-homolog`. Logs `.data/appointment-deletion-*`, capturas e cópias fora do Git.

## Atualização e regressão final

- **209 testes backend locais aprovados em 508,288s**. No CI: 209 em 488,792s e 76 frontend, HTTP, builds e auditorias; execução de 14min20s. Logs locais `.data/appointment-deletion-ci.log` e `.data/appointment-deletion-full.log`.
- HTTPs anteriores de edição de agenda e exames adaptados e aprovados. Scripts antigos de navegador tiveram a sintaxe conferida; o Chrome executado nesta entrega foi o novo teste de exclusão de consultas, sem alegar repetição de todos os scripts antigos.
- Principal em **https://localhost:18443**, API/web atualizados juntos, revisão `0021` mantida. Dez verificações gerais aprovadas. Clientes antigos devem recarregar a página.
- Cópias públicas/exames/fingerprints antes da atualização e dump completo após zero schemas descartáveis, todos `pre-2B6-2-1*` locais. Comparação integral antes/depois do smoke confirmou todas as linhas de negócio, referências financeiras e bytes de exames preservados. Zero schemas descartáveis após entrega; nenhum volume removido.
- Gateway remoto: 413/503, JSON 408 em 30,012s, vagas liberadas; 80 chamadas de saúde com p95 de 0,0392s. Fechamento posterior ao CI somente documental.

## Reprodução

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml build api web
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 -e PYTHONPATH=/app:/app/tests api python -m unittest test_appointment_deletion test_appointment_version -v
python scripts/smoke_appointment_deletion_homolog.py
python scripts/smoke_appointment_deletion_browser_homolog.py
```

Chrome/Playwright e CA local confiável necessários; `PLAYWRIGHT_MODULE` pode apontar ao módulo externo. Harnesses HTTP/Chrome sequenciais (porta 18001 compartilhada); Chrome usa HTTPS descartável 18444. Segredos transitórios via stdin; nenhum diagnóstico bruto do navegador é impresso. Scripts antigos de edição/agenda/financeiro/exames tiveram os DELETEs de limpeza adaptados; não confundir isso com repetição de todos os navegadores antigos.

## Limites e próxima etapa

Não altera exclusões de dentistas/pacientes/exames, auditoria clínica, geração de consulta cancelada ou composição financeira por itens. A versão da consulta não representa mudanças financeiras; geração e exclusão podem ambas confirmar quando a cobrança é gravada primeiro. Próximo recorte após fechamento: preparação 2B.6.3, exclusão de dentistas e vínculos/disponibilidade. Pacientes/exames exigem contrato dos filhos e arquivos.
