# Etapa 2B.5 — financeiro: mapeamento e sequência de correções

Preparação concluída em 21/09/2026, base `300e12f`, banco `0018_specialty_version`. Esta entrega é de diagnóstico e definição dos recortes; os problemas reproduzidos abaixo ainda existem no programa. Não houve migração nem alteração de regra financeira.

**Atualização em 22/09/2026:** a descrição acima e as reproduções são históricas. A [2B.5.1 está concluída](./homologacao-etapa-2B5-1.md), com versão e proteção contra operações antigas. O [contrato próprio da 2B.5.2](./plano-etapa-2B5-2.md) foi definido; pagamentos imutáveis/estornos ainda não foram implementados. Próximo recorte: 2B.5.2.1.

## Caminhos de gravação encontrados

| Operação | Caminho atual | Risco e garantia existente |
| --- | --- | --- |
| Criar manualmente | `POST /api/financial` | Aceita pendente, pago ou cancelado; pago sem data recebe horário atual. Não tem chave de repetição. Índice impede segunda cobrança ativa para consulta vinculada. |
| Gerar de consulta | `POST /api/financial/from-appointment/{id}` | Também aceita status/data de pagamento. Chave opcional e recibo persistente da 2A.2 impedem geração duplicada/recriação tardia. Reenvio retorna estado atual, sem recalcular preço. |
| Editar/cancelar/reativar | `PUT /api/financial/{id}` | Caso de uso lê estado, mescla campos e grava tudo sem versão. Cancelamento é apenas mudança de status; sair de pago apaga `paid_at`. Não há motivo/autoria. |
| Baixar | `POST /api/financial/{id}/mark-paid` | Lê status e rejeita cancelado antes da gravação. Não protege esse intervalo; pago pode receber nova data/forma. Sem versão/chave. |
| Excluir | `DELETE /api/financial/{id}` | Exclusão física de qualquer status, sem versão. Recibo de geração fica com referência nula e continua bloqueando reenvio antigo. |
| Excluir cadastro relacionado | FKs de paciente, dentista e consulta com `SET NULL` | Vínculo financeiro pode desaparecer por exclusão de referência. `procedure_ids` é JSON de IDs, sem FK por elemento nem descrição histórica. |

O formulário envia nome/descrição, valores, vencimento, status, pagamento, vínculos e notas. O servidor também mescla dados quando a API recebe uma alteração parcial: **versionar apenas o frontend não basta**. O botão Baixar aparece somente para pendentes, mas uma aba antiga ou chamada direta continua atingindo o servidor. Editar/excluir não têm restrição de status na tela.

Arquivos principais:

- `apps/api/src/core/use_cases/financial_use_cases.py`: normalização, mescla, baixa e geração.
- `apps/api/src/adapters/db/repositories/financial_repository.py`: gravações, unicidade e recibos de geração.
- `apps/api/src/api/routers/financial_router.py`, `api/schemas/schemas.py`, `core/ports/repositories.py`, `core/domain/entities.py`, `adapters/db/models/models.py`.
- `apps/web/src/pages/financial/financial-page.tsx`, `src/lib/services.ts`, `src/types/index.ts`.
- `apps/api/alembic/versions/0013_financial_generation.py`, `apps/api/tests/test_financial_concurrency.py`, `scripts/smoke_financial_homolog.py`, `scripts/smoke_financial_browser_homolog.cjs`.

## Autoria, permissões e histórico

As rotas conferem permissões, mas não passam o usuário autenticado aos casos de uso financeiros. A dependência `require_permission` já retorna o usuário; a futura autoria deve vir dessa identidade no servidor, nunca de ID livre no corpo enviado pelo navegador.

Na matriz padrão, administrador/coordenador podem criar, editar e excluir; recepção pode criar/editar, mas não excluir; dentista somente consulta. A matriz persistida é configurável. Baixa e cancelamento compartilham a permissão `update`; não existe permissão própria de estorno. Isso é inspeção do código, não auditoria das permissões efetivas de cada instalação.

`paid_at` é a data do pagamento informada ou inferida. `updated_at` é apenas a última modificação. Nenhuma delas substitui um histórico com autor, instante da operação, motivo e estado anterior. A tabela `financial_generations` guarda deduplicação, não autoria nem eventos financeiros. Não inventar autores, datas ou meios de pagamento antigos ao migrar.

## Evidências desta preparação

### PostgreSQL real, schemas descartáveis

Reproduções executadas na imagem de homologação usando a fixture `FinancialConcurrencyTests`, que cria schema exclusivo e aplica as migrações. Sete cenários confirmados:

1. Baixar duas vezes com datas/formas distintas substitui a primeira data e forma.
2. Alterar o valor de um lançamento pago regrava seu total mantendo status pago.
3. Enviar um rascunho com status pendente após a baixa reabre o lançamento e elimina a data do pagamento.
4. Excluir lançamento pago remove fisicamente o registro.
5. Uma baixa lê pendente; outra conexão confirma cancelamento antes da gravação da baixa; a baixa então muda o cancelado para pago. Intercalação controlada no ponto anterior ao `repository.update`, sem depender de atrasos arbitrários.
6. Uma alteração somente de notas lê R$ 120,00; outra conexão grava R$ 234,56 antes da primeira escrita; a primeira restaura R$ 120,00 por carregar o snapshot mesclado antigo.
7. Duas baixas em conexões independentes, sincronizadas por barreira após a leitura, com datas distintas, retornam sucesso para ambas.

### API HTTP real

API/schema descartáveis pela infraestrutura de `smoke_bootstrap_homolog.py`, porta 18001. Dez grupos executados: sete de preparação/isolamento e três de diagnóstico financeiro. Confirmados HTTP 200 em repetição que troca data/forma, edição de valor pago e reabertura; exclusão de pago retorna 204 e leitura posterior 404.

Esses resultados **confirmam defeitos**, não aprovam o fluxo financeiro. Não adicionar ao CI testes que exijam que esses defeitos continuem existindo. Scripts de investigação e logs ficam locais em `.data/probe_finance_2b5*.py`, `.data/financial-2b5-*.log`; os cenários acima bastam para transformá-los em testes de proteção durante a implementação.

### Preservação e limites da verificação

Fixtures, schemas, API temporária e segredos descartáveis removidos. Zero schemas de teste restantes; comparação com fingerprints existentes confirmou dados de negócio e bytes de exames preservados. Banco principal continua em `0018_specialty_version`. Sem reinício/atualização dos serviços principais ou remoção de volume nesta preparação.

Interface foi inspecionada no código; **não houve novo teste de navegador financeiro** nesta entrega. Builds e suíte geral não repetidos porque não houve mudança executável. Última regressão do produto: [CI 35636864205](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35636864205), 167 backend/53 frontend. A reprodução atual é evidência adicional dos riscos financeiros ainda pendentes.

## Sequência proposta

### 2B.5.1 — versão em todas as alterações de um lançamento

Primeira correção delimitada: impedir que uma operação baseada em estado antigo sobrescreva outra. Não aplicar versão somente ao PUT deixando baixa ou exclusão capazes de contornar a proteção.

1. Migração própria após `0018`: `financial_entries.version` positiva, inicialmente 1. Não alterar valores, status, vínculos ou recibos antigos. Atualizar entidades/respostas/tipos.
2. Exigir versão inteira positiva no PUT e no corpo da baixa. DELETE recebe versão obrigatória em parâmetro de consulta. Precondição inválida/ausente 422; registro inexistente 404; versão antiga 409 com código `stale_version` e referência segura.
3. No PUT, conferir a versão antes de normalizar o snapshot lido e novamente na escrita atômica. Valores normalizados, total, status, data e vínculos devem ser gravados junto com o incremento; rollback integral em falha. Não permitir mescla de snapshot antigo com valor atual por escrita incondicional.
4. Baixa condicionada à versão e ao estado pendente, no mesmo UPDATE. Nunca atualizar novamente a data de um lançamento já pago pelo endpoint de baixa. Versão antiga retorna conflito; versão atual de pago/cancelado retorna conflito de estado distinto. Falha de resposta exige recarga para conferir resultado; recuperação automática pela mesma chave ficará na 2B.5.2.
5. DELETE condicionado à versão, com confirmação vinculada ao registro/versão exibidos. Uma exclusão antiga não pode apagar uma edição/baixa mais recente. Manter recibos de geração sem referência quando a exclusão for permitida pelo contrato vigente.
6. Criação/geração inicializam versão 1. Geração repetida com a mesma chave continua retornando o mesmo registro no estado/versão atual, sem nova gravação. Preservar índice único, rollback do perdedor e tombstones da 2A.2.
7. Formulário mantém versão e rascunho; recarga explícita conserva significado de valores, datas, status e vínculos. Distinguir versão antiga de consulta já cobrada e conflito de estado; nunca interpretar todo 409 como motivo para descartar o rascunho. Baixa/exclusão usam a versão mostrada e pedem revisão após conflito, sem repetir automaticamente uma operação destrutiva.
8. API/frontend/smokes/clientes atualizados juntos. Abas antigas precisam recarregar; sem fallback para gravação sem versão.

**Limite explícito:** versão não é histórico. Nesta primeira correção, uma edição intencional usando a versão atual ainda segue as regras vigentes, inclusive alteração/exclusão de pago pelo caminho geral. A proteção definitiva dos pagos exige o próximo recorte e deve continuar marcada como pendência R26. Uma baixa repetida rejeitada sem gravar não equivale ao contrato completo de resposta idempotente após perda de conexão.

### 2B.5.2 — baixas idempotentes e proteção dos pagamentos

Definir antes de implementar a máquina de estados e todos os caminhos que criam estado pago: baixa, criação manual, geração e edição. Pagamento deve ter registro próprio, autoria autenticada, valor/data/forma preservados e operação de repetição identificável. Mesma chave/mesmos parâmetros recupera resultado; mesma chave/outros parâmetros retorna conflito; a chave não pode reexecutar pagamento depois de estorno.

Bloquear reescrita/exclusão silenciosa de pagamento; corrigir por operação explícita com motivo e autoria. Integrar recebimentos e despesas, estado do lançamento, cancelamento/estorno e geração idempotente na mesma transação quando necessário. Preservar o formato de pagamentos legados e marcar origem legada/autoria desconhecida, sem atribuir o importado ao administrador atual. Definir tratamento de dados antigos inconsistentes e política de migração antes de gravar eventos.

Esse recorte exige plano próprio. Não converter pagamentos existentes nem remover status do formulário parcialmente enquanto outros endpoints puderem contornar a regra. Parcelamento/pagamentos parciais e escopo clínico permanecem na etapa 4; regras fiscais ou contábeis externas não foram avaliadas aqui.

Contrato próprio definido em [plano-etapa-2B5-2.md](./plano-etapa-2B5-2.md): estados, quatro caminhos de pagamento, transações/recibos, permissões, migração legada e matriz de aceite. Esse documento orienta a implementação seguinte.

### 2B.5.3 — referências históricas e consulta da trilha

Preservar identificação/descrição histórica necessária diante de renomeação/exclusão de cadastros; revisar FKs, snapshots e exclusão de consultas. Expor histórico de forma compreensível, com permissões e sem permitir sua edição comum. Rever resumo/filtros (R27) e datas/fuso (R20) nos recortes correspondentes, sem confundir totais por vencimento com fluxo de caixa por data de pagamento.

## Matriz de aceite da 2B.5.1

| Camada | Critério obrigatório |
| --- | --- |
| Migração | Dados/recibos preservados; versão 1 positiva; backup antes da atualização e comparação após migração/smokes. |
| PostgreSQL | Dois PUTs, PUT × baixa, baixa × cancelamento, baixa × baixa, edição × exclusão: no máximo uma mutação com a mesma versão; perdedor sem gravação parcial. |
| Valores/referências | Total coerente com valor/desconto/acréscimo; atualização parcial preserva campos; FK/índice/validação rejeitados não consomem versão. |
| Baixa | Repetição não muda data, forma, valor ou versão; pago/cancelado não sofrem nova baixa. Estado conflitante distinguido de edição antiga. |
| API | GET/lista/criação/geração retornam versão; PUT/baixa/DELETE exigem versão; 422/404/409 corretos, referência privada preservada; permissões verificadas. |
| 2A.2 | Mesma chave/consulta, chaves divergentes, cancelamento e nova geração, recibo de exclusão e reenvio depois de baixa continuam consistentes. Ajustar precondições dos testes antigos, mantendo suas garantias. |
| Componente | Rascunho conservado em conflito e falha de recarga; revisão usa versão recebida; preço/data/forma/vínculos preservados; sem repetição automática de baixa/exclusão. |
| Chrome | Duas abas: formulário antigo após baixa, dois formulários e exclusão antiga; conflito real, revisão e conferência por API. Capturas fictícias conferidas e limpeza concluída. |
| Entrega | Suíte completa, HTTP, builds e CI aprovados; docs distinguem concorrência de histórico; commit/push, HEAD remoto e checkpoint conferidos. |

Primeiro passo da implementação: criar os testes de disputa/precondição da 2B.5.1, preparar cópias locais e só então adicionar a migração e atualizar conjuntamente os caminhos de gravação. Não iniciar histórico completo ou recuperação de pagamentos legados nesta mesma subetapa.
