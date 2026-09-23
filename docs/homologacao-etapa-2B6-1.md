# 2B.6.1 — exclusão de procedimentos e especialidades

**Concluída em 23/09/2026.** Implementação `b421cc8`, base `c2b7b38`. [Contrato](./plano-etapa-2B6.md). [CI 35874815267](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35874815267) aprovado com **202 backend e 69 frontend**, HTTP, builds e auditorias.

## Mudanças

- DELETE dos dois catálogos exige `?version=N`, inteiro positivo. Ausente/inválido retorna 422; registro ausente, 404; versão antiga, 409 `stale_version`; vínculo impeditivo, 409 `linked_record`.
- Repositório bloqueia a linha e recarrega seu estado antes de comparar versão e excluir na mesma transação. Falhas fazem rollback. Disputa com edição permite uma única mutação vencedora; dois DELETEs não retornam ambos sucesso.
- FK de procedimentos vinculados a consultas continua impedindo exclusão. Excluir especialidade não muda o texto salvo em dentistas. Capturas/recibos financeiros da `0021` permanecem independentes e preservados.
- A confirmação mostra o nome e captura ID/versão da linha exibida. Conflito/ausência/falha exige recarregar e conferir a lista antes de confirmar outra exclusão. Falha de rede/5xx tem resultado incerto, sem sucesso presumido nem reenvio automático. Rascunho de edição não é apagado pela falha de exclusão.
- Rotas, contratos, serviços, componentes e scripts de homologação atualizados juntos. Não há nova migração. Clientes antigos sem versão receberão 422; recarregar abas após atualização da API/web.

## Validação

- Backend focado inicial: 23/24; falha em fixture de vínculo SQL sem `created_at`, corrigida. Cinco testes finais aprovados: versão antiga/inválida/ausência, PUT × DELETE, DELETE × DELETE, vínculo criado depois da leitura e especialidade textual preservada.
- Frontend: **69 testes**, build aprovado. Testes para ambos os catálogos verificam versão da confirmação, conflito/recarga/nova confirmação, rede/falha de recarga sem repetição e cancelamento da confirmação.
- HTTP descartável: dez grupos aprovados, incluindo isolamento, permissões e diferenciação de conflitos. Banco/schema e dados fictícios exclusivos de `erp-dents-homolog`.
- Chrome descartável aprovado: edição em uma aba, exclusão antiga na outra, recarga explícita e nova confirmação nos dois catálogos; procedimento vinculado continua protegido. Capturas conferidas em `.data/homolog/catalog-deletion-*.png`.
- Logs locais `.data/catalog-deletion-*`; cópias `pre-2B6-1*` fora do Git. A suíte local começou antes da correção do fixture; seu resultado é separado do CI aprovado com o teste corrigido.

### Atualização local final

- Suíte antiga: 202 casos em 520,034s, **201 aprovados e um erro** no fixture sem `created_at`, corrigido depois do início da execução. Cinco testes finais na imagem corrigida aprovados em 12,668s, incluindo o caso. O CI validou todos os 202 no mesmo código final; a execução antiga não foi integralmente aprovada.
- Builds API/web e 69 frontend aprovados; HTTP específico, edição de procedimentos/especialidades e referências financeiras aprovados. Os scripts antigos de navegador tiveram sua limpeza adaptada e sintaxe conferida; o fluxo Chrome executado nesta entrega foi o novo teste de exclusões, sem alegar repetição de todos os navegadores antigos.
- Principal atualizada em **https://localhost:18443**, API/web juntos, revisão `0021` mantida. Dez verificações gerais aprovadas. Backup público/exames/fingerprints antes da atualização, dump completo após zero schemas; comparação integral antes/depois do smoke confirmou linhas de negócio, referências financeiras e bytes de exames preservados. Cópias locais `pre-2B6-1*`, nenhum volume removido.
- CI final aprovado em **12min57s**, 202 backend em 308,340s/69 frontend, HTTP, builds e auditorias. Gateway: 413/503, JSON 408 em 30,006s, vagas liberadas; 80 chamadas de saúde, p95 de 0,0208s. Fechamento posterior somente documental, sem repetir testes funcionais já aprovados.

## Reprodução

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml build api web
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 -e PYTHONPATH=/app:/app/tests api python -m unittest test_catalog_deletion test_procedure_version test_specialty_version -v
python scripts/smoke_catalog_deletion_homolog.py
python scripts/smoke_catalog_deletion_browser_homolog.py
```

Chrome/Playwright e certificados locais confiáveis necessários ao último comando. `PLAYWRIGHT_MODULE` pode apontar ao módulo instalado fora do projeto. Harnesses HTTP/Chrome não devem rodar simultaneamente, pois compartilham a porta 18001; o Chrome usa frontend descartável HTTPS em 18444. Segredos transitórios são passados por stdin e diagnósticos brutos do navegador não são impressos.

## Limites

Não altera exclusões de pacientes, dentistas, consultas, usuários ou exames. Versão da linha não representa todos os vínculos: neste recorte, a FK protege procedimentos associados a consultas, e as referências financeiras têm histórico próprio. Não converte especialidade textual em FK nem substitui exclusão por inativação. Os demais recursos precisam de seus contratos; pacientes/exames requerem considerar alterações dos filhos e limpeza de arquivos.
