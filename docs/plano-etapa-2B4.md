# Etapa 2B.4 — preparação dos catálogos

Base `6d656a3`, mapeamento concluído em 20/09/2026. Usuário informou 18% de contexto; fase dividida em procedimentos (2B.4.1) e especialidades (2B.4.2). A implementação da 2B.4.1 prosseguiu após este mapeamento; consultar o checkpoint atual no plano de execução para seu estado de validação.

## Contratos encontrados na base `6d656a3`

| Recurso | Gravação atual | Referências e efeito de alterações |
| --- | --- | --- |
| Procedimento | `name`, `description`, `duration_minutes`, `price_cents`, `active`; repositório lê e altera sem versão | Consultas usam IDs em `appointment_procedures`, com FK restritiva na exclusão. Duração do catálogo alimenta sugestões no formulário; horários salvos pertencem à consulta. |
| Especialidade | `name` único e `active`; repositório lê e altera sem versão | `dentists.specialty` é texto, sem FK. Renomear/excluir o item do catálogo não atualiza o texto dos dentistas. O formulário mantém o valor textual antigo como opção. |
| Cobrança gerada | Soma preços atuais dos procedimentos ao gerar; valor fica armazenado em `financial_entries.amount_cents` | Versionar o catálogo não define preço histórico nem uma leitura consistente de vários preços alterados simultaneamente. Cobrança já gerada não é recalculada automaticamente pela edição do catálogo. |

As duas telas enviam todos os campos de seus formulários e não guardam versão. Os serviços já possuem `get(id)`, útil para recarga explícita. Há risco de uma edição antiga restaurar preço, duração ou ativação, mesmo quando o operador pretendia mudar apenas o nome.

Arquivos conferidos:

- `apps/api/src/adapters/db/repositories/{procedure,specialty}_repository.py` e modelos em `models/models.py`.
- `apps/api/src/core/use_cases/{procedure,specialty,financial}_use_cases.py`; contratos em `api/schemas/schemas.py`.
- `apps/web/src/pages/procedures/procedures-page.tsx`, `pages/specialties/specialties-page.tsx`, `pages/dentists/dentists-page.tsx` e formulários de agenda.
- `apps/web/src/lib/services.ts` e tipos em `src/types/index.ts`.

## Recortes de implementação

### 2B.4.1 — procedimentos

1. Migração própria com `procedures.version` positiva, inicialmente 1; preservar preços, durações, descrições, vínculos e cobranças.
2. Incluir versão nas entidades/respostas/tipos; exigir inteiro positivo estrito no PUT. Comparação/incremento no mesmo UPDATE, campos permitidos explícitos e rollback integral em falha.
3. Manter padrão das entregas anteriores: precondição inválida/ausente 422, versão antiga 409, registro inexistente 404. Atualização parcial preserva campos omitidos; envio sem mudança consome versão.
4. Formulário guarda versão original; preserva rascunho em conflito; botão explícito para descartar e carregar o atual. Falha de recarga preserva dados. Coordenar salvar/recarregar/cancelar/fechar.
5. Conferir formatos de preço: `null`, zero, centavos e vírgula decimal; não converter valor vazio em zero durante recuperação.

### 2B.4.2 — especialidades

Aplicar o mesmo contrato de versão ao nome/ativação, em entrega separada. Validar também colisão do nome único: erro 409 não deve consumir versão nem alterar dados. A interface precisa explicar a diferença entre nome já existente e edição desatualizada; não afirmar que todo 409 é conflito de versão.

Renomeação continua alterando somente o catálogo neste recorte. Registrar explicitamente a limitação dos textos nos dentistas. A conversão para vínculo por ID exige inventário dos valores existentes, correspondências ambíguas e política de nomes inativos/excluídos; não atualizar dentistas em massa implicitamente.

## Matriz mínima de aceite por recorte

| Camada | Evidência exigida |
| --- | --- |
| PostgreSQL isolado | Duas conexões com a mesma versão: um vencedor; campos do perdedor não gravados. Revisão parcial, ativação antiga, repetição, exclusão anterior, rollback e migração preservando dados. |
| API HTTP | GET/lista/criação retornam versão; PUT exige precondição; disputa retorna um sucesso/um 409; recarga permite revisão; validação inválida não consome versão. |
| Componente | Rascunho preservado após conflito e recarga malsucedida; recarga explícita substitui campos e versão; salvamento usa a nova versão. Preços/durações conservam significado. |
| Chrome real | Duas abas com dados fictícios, respostas reais, recuperação e salvamento revisado; capturas conferidas e fixtures removidas. |
| Preservação | Cópias locais antes da atualização; comparação de campos anteriores, vínculos, cobranças e bytes de exames. Excluir apenas nova versão, revisão Alembic e autenticação da comparação. |
| Entrega | Builds, suíte de regressão e CI aprovados; API/frontend atualizados juntos, abas antigas recarregadas, documentação e commit/push, HEAD igual ao remoto. |

Não afrouxar testes de upload: manter JSON 408 em ambas as conexões antes de 35s e vagas liberadas. Disputas GiST da agenda admitem especificamente `23P01` e `40P01`, ambos com rollback/409; não transformar falha desconhecida em sucesso.

## Fora do escopo e pendências explícitas

- Exclusão com versão, atualização automática entre computadores e revisão geral das telas.
- Vínculo por ID entre dentistas/especialidades e política de propagação de renomeação.
- Preço histórico, alterações de catálogo durante geração de cobrança e histórico de pagamentos/estornos.
- Disponibilidade de dentistas versus consultas já marcadas/criadas simultaneamente.

## Validação desta preparação

Inspeção estática dos arquivos acima, conferência somente de leitura no `erp-dents-homolog` e revisão do diff. Foram encontrados dois usuários fictícios ativos, listados na primeira linha do README a pedido do usuário; somente identificadores/perfis, sem consulta ou publicação de senhas/hashes. Lista pontual desta máquina, sem sincronização automática nem garantia de existência em outro servidor.

O mapeamento em si foi somente de leitura. Referência anterior: 2B.3, CI `35487864107`, 147 testes backend e 46 frontend aprovados. Implementação de **2B.4.1 — procedimentos** segue esta matriz; seus resultados devem ser registrados separadamente, sem confundir inspeção estática com homologação funcional.
