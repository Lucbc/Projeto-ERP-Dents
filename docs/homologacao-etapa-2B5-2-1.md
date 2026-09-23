# Etapa 2B.5.2.1 — pagamentos, estornos e recibos duráveis

Base `a2f98d4`, concluída em 22/09/2026. Implementação `bb61990` e complemento `37b20d3` do [contrato de pagamentos](./plano-etapa-2B5-2.md). [CI 35756213438](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35756213438) aprovado em **11min15s**: **188 backend, 61 frontend**, HTTP, builds e auditorias. Homologação atualizada, Chrome e preservação aprovados.

## Comportamento entregue

- Baixa integral gera pagamento com valores originais, data, forma e identidade obtida da sessão autenticada. Tipo receita/despesa e total zero são preservados; forma nula significa não informada. Novas datas informadas exigem fuso.
- Pago não pode ser editado, cancelado ou excluído pelo formulário/PUT/DELETE. Para corrigir, usar **Ver pagamentos → Estornar registro**, informando motivo; o lançamento volta a pendente e pode ser corrigido/baixado novamente. Estorno não executa devolução externa.
- Pagamento e estorno são registros separados, protegidos contra UPDATE/DELETE no PostgreSQL. Lançamento com qualquer histórico não pode ser excluído fisicamente, mesmo depois de estorno/cancelamento. Exclusão de pendente/cancelado sem histórico continua condicionada à versão.
- Mesmo UUID de operação e mesmos parâmetros recuperam o evento original e o lançamento atual. Dados diferentes retornam `idempotency_conflict`. Reenvio depois de estorno/nova baixa não repete a operação e não muda versão. Recibos sobrevivem a reinício e troca de sessão; acesso é revalidado antes da recuperação.
- Criação manual paga e geração paga permanecem disponíveis com chave obrigatória, pagamento e recibos na mesma transação. PUT deixa de ser caminho para registrar pagamento. Geração antiga preserva seu recibo/hash; nova geração paga também possui hash canônico da operação, com equivalência de instantes em fusos diferentes.
- Estorno exige `financial.update` e `financial_reversals.create`. Administrador mantém acesso; novo recurso começa negado para todos os outros perfis, sem herdar autorização de editar/excluir. Concessão e revogação pela tela de permissões.

## API e persistência

`POST /api/financial/{id}/mark-paid` exige `version` positiva e `idempotency_key` UUID; aceita data/forma. `POST /api/financial/{id}/reverse-payment` exige versão, chave, `payment_id` ativo e motivo de 3–500 caracteres após trim. Ambos retornam `entry`, `payment`, `reversal` e `replayed`.

`GET /api/financial/{id}/payments` retorna trilha somente leitura, com estorno associado. Respostas de lançamento incluem `active_payment_id` e `has_payments`. Campos de autor enviados pelo cliente não determinam autoria. Identidade de exibição é preservada no evento, independentemente de renomeação/exclusão posterior do usuário.

Versão antiga: 409 `stale_version`; estado incompatível: `financial_state_conflict`; edição/exclusão proibida: `payment_immutable`; tentativa de baixa pelo PUT: `payment_action_required`. Conflitos codificados mantêm `request_id`. Corpo sem versão/chave na baixa: 422; criação/geração paga sem chave: validação de domínio 400. Reenvio exato de geração legada é consultado antes da validação das novas regras de pagamento.

Migração `0020_financial_history` cria `financial_payments`, `financial_reversals`, `financial_operations` e referência ativa. Transações usam bloqueio por chave e por lançamento, com versão; triggers diferidos conferem consistência do pagamento ativo, estado e valores. Falha no evento/recibo desfaz a alteração do lançamento. FKs impedem ligar pagamento de outro lançamento ou perder histórico por exclusão.

Eventos são escritos com SQL explícito no repositório de histórico; não usar autogeração de migração para substituir triggers/tabelas sem revisão. Imutabilidade não impede um administrador do banco de remover deliberadamente essas proteções.

## Dados antigos e atualização

Pago existente ganha um evento `legacy`, com valores/data/forma copiados e autor desconhecido. Instante de importação é separado da data de pagamento; versão não muda. Pendentes/cancelados não ganham pagamentos inventados. Dados inconsistentes (data ausente em pago, data em não pago, valores negativos ou total divergente) abortam a migração inteira; forma nula e zero continuam suportados.

Downgrade recusa descarte de eventos novos. Recuperação operacional exige procedimento de restauração; não remover volumes nem tentar descartar a trilha para fazer uma versão antiga iniciar. API e frontend precisam ser atualizados juntos; recarregar abas antigas.

Backups/fingerprints locais `pre-2B5-2-1*`, fora do Git. Dump completo salvo antes da atualização principal, após encerrar schemas descartáveis. Principal em `0020_financial_history`, **https://localhost:18443**; um pagamento fictício importado como legado sem autor. Comparação antes/depois preservou todas as colunas anteriores, inclusive versão e bytes de exames. Excluídos autenticação/Alembic, tabelas novas e referência ativa. A extensão de `role_permissions` foi verificada separadamente contra dados extraídos do dump: permissões anteriores e `created_at` iguais, apenas novo recurso padrão e `updated_at` acrescentados. Nenhum volume removido.

## Interface e incerteza de rede

Confirmação de baixa mostra total, data e forma. Enquanto o resultado estiver incerto, mantém a chave e o corpo da tentativa e oferece **Consultar/repetir esta operação**. A mesma proteção existe para criação paga e geração. Criação manual pendente/cancelada ainda não possui recibo: após resposta incerta, oferece conferência da lista, sem reenvio. Campos ficam bloqueados até recuperação/conferência; não criar automaticamente uma nova chave após falha de rede.

Ao sair/reabrir, persistem apenas marcadores de conferência no escopo da sessão, sem corpo do formulário, motivo, credenciais ou dados clínicos. A tela exige revisão do histórico/lista antes de iniciar outra operação. Troca de identidade elimina esses marcadores; uma nova sessão precisa consultar os dados atuais. Não é uma fila offline de pagamentos.

## Validação

- **Banco:** 28 testes focados iniciais aprovados; conjunto ampliado para 11 casos de histórico mais os 21 anteriores. Onze finais aprovados em 51,429s. Disputas de baixa/estorno com chave igual/diferente, criação paga concorrente vinculada à consulta, datas equivalentes, repetição após nova baixa, FK/imutabilidade, falha ao inserir evento ou recibo, downgrade protegido, importação/recibo legado e abortos transacionais.
- **HTTP descartável:** onze grupos de histórico aprovados: concorrência, autoria, bloqueio de PUT/DELETE, permissão concedida/revogada, reinício e nova sessão, reenvios tardios, criação paga e zero. Smokes de geração e versão adaptados e aprovados. Comparação de datas usa instantes completos, incluindo microssegundos, pois UTC e `-03:00` podem representar o mesmo horário.
- **Frontend:** 61 testes aprovados, incluindo reenvio com mesma chave/corpo, conflito sem retry automático, estorno, isolamento de sessão, criação incerta e formulário recarregado pago somente leitura. Criação manual sem pagamento exige conferir a lista, sem prometer recuperação idempotente inexistente.
- **Chrome real:** servidor web/HTTPS/API/schema descartáveis, porta 18444, CA local confiável no Chrome e no Node. Simulada perda de resposta **após commit** de baixa e estorno, seguida de recuperação sem duplicação; formulário antigo após pagamento; estornar/corrigir/baixar novamente; reenvios antigos mantêm versão/estado atuais. Cenário repetido com imagens finais e aprovado. Capturas fictícias conferidas; containers/schema removidos. Na principal, consulta somente leitura confirmou o legado com autor desconhecido. Diagnóstico bruto do Playwright é suprimido por poder conter cabeçalhos.
- Builds API/web aprovados. Regressão completa local: **187 testes em 541,720s**, seguida dos 11 finais com um caso acrescentado; **188 testes em 365,659s no CI final**. Dez grupos gerais passaram após atualização principal. Smoke geral mantém apenas cobrança pendente removível; testes de baixa com histórico ficam nos schemas descartáveis. Script antigo de navegador de versão delega ao novo cenário isolado, evitando fixtures permanentes na base principal. O smoke Chrome antigo de geração recebeu adaptação ao botão de repetição e não foi repetido; geração continua coberta por PostgreSQL/HTTP.
- Gateway no CI: 413/503, JSON 408 em 30,006s, vagas liberadas e 80 chamadas de saúde, p95 de 0,0243s. Auditorias aprovadas, cinco imagens sem achados na consulta. Zero schemas descartáveis locais após os testes.

Comandos específicos:

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 -e PYTHONPATH=/app:/app/tests api python -m unittest test_financial_history test_financial_version test_financial_concurrency -v
python scripts/smoke_financial_history_homolog.py
python scripts/smoke_financial_homolog.py
python scripts/smoke_financial_version_homolog.py
python scripts/smoke_financial_history_browser_homolog.py
```

Smokes HTTP/browser compartilham porta 18001: executar sequencialmente. Browser exige imagem web atualizada, Chrome, CA confiável e `PLAYWRIGHT_MODULE` se necessário. O wrapper Node antigo aceita `PYTHON` com caminho do interpretador.

## Limites e próxima etapa

Pagamentos integrais e estornos de registro estão cobertos; não há integração bancária, pagamento parcial, parcelamento, conciliação ou trilha de todas as edições anteriores. Dados apagados/reabertos antes desta migração não podem ser reconstruídos.

Próximo recorte **2B.5.3**: preservar referências históricas diante de renomeação/exclusão de pacientes, dentistas, consultas e procedimentos; complementar consulta da trilha. R26 continua parcial nesses vínculos. Datas/fuso geral, filtros/totais por vencimento versus caixa e atualização automática entre computadores permanecem nas etapas correspondentes. Não declarar todo o ERP pronto para produção por esta entrega.
