# 2B.5.3.1 — referências históricas financeiras

## Estado

**Concluída em 23/09/2026.** Implementação `6b3109d`, iniciada a partir de `c1f0699`. [CI 35808882862](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35808882862) aprovado: **197 backend e 63 frontend**, HTTP, builds e auditorias. Contrato: [plano-etapa-2B5-3.md](./plano-etapa-2B5-3.md).

## Comportamento implementado

- Origem do lançamento e referências de cada pagamento ficam em registros separados, com descrição financeira, IDs/nomes mínimos de paciente/dentista/procedimentos e ID/data da consulta. Não copiam documentos, contatos, notas clínicas ou preços atuais como se fossem preços cobrados.
- Renomeações, reagendamentos e exclusões permitidas não reescrevem essas capturas. Após estorno, outra baixa captura as referências disponíveis naquele momento. O estorno mantém seu evento e motivo originais.
- Leitura por `financial.view`; não há endpoint de edição das capturas. Origem disponível também em lançamentos sem pagamento, pelo botão “Ver histórico”. Campos de nomes atuais continuam com seu significado, identificado nos cabeçalhos da lista.
- Busca textual inclui as capturas históricas, usando EXISTS para não multiplicar lançamentos, totais de resultados ou páginas. Filtros por ID continuam aplicados aos vínculos atuais.
- Reenvio de baixa/criação paga/geração recupera o evento com a captura persistida e o estado atual do lançamento. Não reconstrói o pagamento usando nomes novos.
- Procedimentos excluídos deixam de integrar as seleções atuais retornadas ao formulário. Permanecem nas capturas, permitindo corrigir um pendente após estorno sem referências invisíveis inválidas.

## Garantias transacionais e migração

`0021_financial_references` cria `financial_entry_references` e `financial_payment_references`. Triggers AFTER INSERT produzem exatamente uma captura junto de cada novo lançamento/pagamento; falha da captura aborta a operação. Chaves primárias garantem unicidade, triggers rejeitam reescrita/exclusão direta. A origem de um rascunho pode ser removida somente pela exclusão autorizada do lançamento proprietário; pagamentos continuam impedindo sua exclusão.

Captura obtém bloqueios compartilhados em consulta, paciente, dentista e procedimentos (estes ordenados por ID). Usa NOWAIT nas referências clínicas para não aguardar na ordem inversa à exclusão, que pode partir do cadastro e atualizar a FK financeira. Contenção `55P03` retorna 409 para revisão; não há repetição automática. O PostgreSQL continua podendo rejeitar outros conflitos/deadlocks pelo tratamento existente. Edição do array de procedimentos é verificada no banco; a validação prévia de existência já existia no caso de uso.

Migração bloqueia escrita financeira enquanto copia o estado disponível. Todas as capturas anteriores recebem origem `migration`, mesmo quando o pagamento já tinha origem `recorded`. A tela avisa que a referência pode diferir da original. Valores brutos de IDs de procedimentos legados sem cadastro são preservados, com nome ausente. Nada infere nomes apagados, autoria ou horário do fato original. Downgrade recusa descartar capturas novas.

As tabelas/triggers financeiros usam SQL explícito nas migrações, como na `0020`; não aplicar autogeração de migrações que os remova por não constarem no metadata ORM. Backup e restauração precisam incluir esquema completo e funções/triggers.

## Evidências

- Primeira rodada focada: 38/39 aprovados; corrigida expectativa de um teste que confundia validação de domínio já existente com rejeição transacional. A correção não removeu a validação; o teste passou a atingir separadamente as duas camadas.
- Frontend: 63 testes aprovados; build aprovado. Componente verifica rótulos de migração, captura nova e referência indisponível, sem controles de edição.
- HTTP descartável: nove grupos aprovados, incluindo preparação/limpeza, renomeação/exclusão, dois pagamentos, reenvio, busca sem duplicação e negação de consulta sem permissão financeira.
- Chrome HTTPS descartável: duas abas, perda de resposta após commit, recuperação, bloqueio de rascunho antigo, estorno/correção/nova baixa, nomes anterior/posterior e exclusão preservando histórico. Capturas locais em `.data/homolog/financial-history-*.png`; dados exclusivamente fictícios.
- Resultados finais de regressão, migração, imagens, preservação e CI registrados abaixo.

### Validação local final

- **195 backend em 544,450s**, sem falhas; nove testes finais de referências em 44,033s, incluindo dois acrescentados depois do início da suíte (197 casos distintos esperados no CI). Migração de pagamento já registrado preserva o evento e marca somente a captura complementar como migração. Disputas controladas verificam exclusão entre validação/gravação e contenção durante baixa, sem persistência parcial.
- HTTP final: nove grupos aprovados, incluindo correção após exclusão dos procedimentos. Chrome final e capturas conferidos, com rolagem permitindo ler ambos os pagamentos e fechar a janela. Builds finais aprovados; 63 testes de frontend.
- Principal em **https://localhost:18443**, revisão `0021_financial_references`, API/web juntos. Uma origem/um pagamento anteriores receberam captura `migration`; Chrome somente leitura conferiu os avisos. Dez verificações gerais aprovadas.
- Dump público/exames/fingerprints `pre-2B5-3-1*` antes da atualização; dump completo após limpeza dos schemas. Comparação posterior confirmou todas as colunas antigas, eventos, recibos, permissões e bytes dos exames. Nenhum volume removido. Cópias, credenciais e capturas fora do Git.
- Implementação `6b3109d` publicada; CI `35808882862` aprovado em **14min25s**, com **197 backend em 496,644s e 63 frontend**, HTTP, builds e auditorias. Gateway: 413/503, JSON 408 em 30,012s, vagas liberadas; 80 chamadas de saúde, p95 de 0,0434s. Fechamento posterior somente documental; testes não repetidos sem nova mudança ou falha.

## Comandos de reprodução

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml build api web
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 -e PYTHONPATH=/app:/app/tests api python -m unittest test_financial_references test_financial_history test_financial_version test_financial_concurrency -v
python scripts/smoke_financial_references_homolog.py
python scripts/smoke_financial_history_browser_homolog.py
```

Chrome instalado e Playwright acessível pelo Node são necessários ao último comando; configurar `PLAYWRIGHT_MODULE` quando instalado fora do projeto. O harness usa certificados locais confiáveis, porta 18444 e API/schema descartáveis; não desabilita validação TLS. Não executar harnesses HTTP simultaneamente porque compartilham a porta 18001.

## Limites

Não recupera dados apagados antes da migração, nem registra todas as edições de rascunhos/cadastros. As FKs atuais ainda podem ficar nulas após exclusão permitida; a captura é independente. Estornar não depende de recadastrar referências desaparecidas. Não altera regras clínicas de exclusão, não cria exclusão de pacientes em cascata adicional e não implementa parcelamento/caixa por data de pagamento. Desempenho de busca histórica com grande volume permanece para a etapa de carga; buscas usam texto JSON e consultas de referência por lançamento.
