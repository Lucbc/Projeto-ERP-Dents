# 2B.6.1 — exclusão de procedimentos e especialidades

Implementação em validação, base `c2b7b38`, iniciada em 23/09/2026. [Contrato](./plano-etapa-2B6.md). Não considerar concluída antes do CI e fechamento no plano de execução.

## Mudanças

- DELETE dos dois catálogos exige `?version=N`, inteiro positivo. Ausente/inválido retorna 422; registro ausente, 404; versão antiga, 409 `stale_version`; vínculo impeditivo, 409 `linked_record`.
- Repositório bloqueia a linha e recarrega seu estado antes de comparar versão e excluir na mesma transação. Falhas fazem rollback. Disputa com edição permite uma única mutação vencedora; dois DELETEs não retornam ambos sucesso.
- FK de procedimentos vinculados a consultas continua impedindo exclusão. Excluir especialidade não muda o texto salvo em dentistas. Capturas/recibos financeiros da `0021` permanecem independentes e preservados.
- A confirmação mostra o nome e captura ID/versão da linha exibida. Conflito/ausência/falha exige recarregar e conferir a lista antes de confirmar outra exclusão. Falha de rede/5xx tem resultado incerto, sem sucesso presumido nem reenvio automático. Rascunho de edição não é apagado pela falha de exclusão.
- Rotas, contratos, serviços, componentes e scripts de homologação atualizados juntos. Não há nova migração. Clientes antigos sem versão receberão 422; recarregar abas após atualização da API/web.

## Validação em andamento

- Backend focado inicial: 23/24; falha em fixture de vínculo SQL sem `created_at`, corrigida. Cinco testes finais aprovados: versão antiga/inválida/ausência, PUT × DELETE, DELETE × DELETE, vínculo criado depois da leitura e especialidade textual preservada.
- Frontend: **69 testes**, build aprovado. Testes para ambos os catálogos verificam versão da confirmação, conflito/recarga/nova confirmação, rede/falha de recarga sem repetição e cancelamento da confirmação.
- HTTP descartável: dez grupos aprovados, incluindo isolamento, permissões e diferenciação de conflitos. Banco/schema e dados fictícios exclusivos de `erp-dents-homolog`.
- Chrome descartável aprovado: edição em uma aba, exclusão antiga na outra, recarga explícita e nova confirmação nos dois catálogos; procedimento vinculado continua protegido. Capturas conferidas em `.data/homolog/catalog-deletion-*.png`.
- Regressão completa, preservação principal e CI: pendentes de registro final. Logs locais `.data/catalog-deletion-*`; cópias `pre-2B6-1*` fora do Git. A suíte local começou antes da correção do fixture; conferir a falha conhecida separadamente e o resultado completo do CI com o teste corrigido.

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
