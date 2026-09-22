# Etapa 2B.5.2 — contrato de pagamentos, estornos e repetição

Preparação concluída em 22/09/2026, base `9eee763`, banco `0019_financial_version`. Este documento define a implementação seguinte; **as regras abaixo ainda não estão implementadas**. A proteção vigente é a [2B.5.1](./homologacao-etapa-2B5-1.md). Não declarar R26 resolvido por esta preparação.

## Resultado esperado

Um pagamento confirmado deve manter valor, data, forma e autor, mesmo após correção. Corrigir exige estorno explícito com motivo; reenviar uma solicitação cuja resposta se perdeu deve recuperar a operação original, sem novo pagamento. Vale para recebimentos e despesas; não integra bancos, cartões ou transferência real de dinheiro.

Nesta entrega, pagamento é integral, pelo total do lançamento. Parcelas, pagamentos parciais e conciliação ficam na etapa 4. Estorno significa desfazer o registro no ERP, não executar devolução externa. A interface deve explicar isso antes de confirmar.

## Decisões de implementação

### Estados e operações

Manter `pending`, `paid` e `cancelled` no lançamento. Estorno é um evento próprio; não reutilizar `cancelled` para significar pagamento desfeito.

| Origem | Operação | Resultado |
| --- | --- | --- |
| Pendente | Editar dados sem mudar para pago | Continua pendente, versão incrementada; validação/índice existentes mantidos. |
| Pendente | Baixar | Pago, um pagamento integral e recibo da operação na mesma transação. |
| Pendente | Cancelar | Cancelado; nenhuma movimentação de pagamento criada. |
| Cancelado | Reativar | Pendente, sujeito à unicidade de cobrança ativa por consulta. |
| Cancelado | Baixar | Conflito de estado; primeiro reativar explicitamente. |
| Pago | PUT, cancelar ou excluir | Rejeitar; orientar estorno. Não permitir nem edição de notas no PUT genérico enquanto pago. |
| Pago | Baixar com nova chave | Conflito de estado. |
| Pago | Estornar pagamento ativo | Pendente, incremento de versão, um estorno imutável e motivo obrigatório. |
| Qualquer estado | Reenviar mesma operação já concluída | Recuperar evento original e estado atual; não mudar versão nem executar novamente. |
| Pendente/cancelado com histórico | Excluir | Rejeitar exclusão física; cancelamento preserva o histórico. |
| Pendente/cancelado sem histórico | Excluir | Manter exclusão condicionada à versão e recibos de geração da 2A.2. |

Depois de estornar, o lançamento pode ser corrigido e receber nova baixa com **nova chave**. Valores do pagamento anterior permanecem no evento; não dependem dos valores atuais do lançamento. Estornar não libera a consulta para uma segunda cobrança ativa: o lançamento volta a pendente. Para substituir a cobrança, cancelar depois do estorno, respeitando versão e índice.

Total zero continua permitido como hoje; uma baixa integral de zero deve ser identificável pelo valor, sem inventar movimento positivo. Valores negativos ou total divergente bloqueiam a operação. Exigir data com fuso para novos pagamentos informados pela API; data omitida é resolvida uma única vez no servidor. Forma nula continua significando “não informada”, sem converter para dinheiro. Revisão geral de datas/fuso permanece na etapa 3.

### Fechar todos os caminhos para estado pago

| Caminho atual | Contrato seguinte |
| --- | --- |
| `POST /api/financial` | Manter criação já paga, mas exigir chave para esse caso; lançamento, pagamento, autoria e recibo na mesma transação. Criação pendente/cancelada permanece disponível. |
| `POST /api/financial/from-appointment/{id}` | Manter geração já paga, exigindo chave; recibo de geração e pagamento atômicos. Mesma chave retorna resultado sem recalcular preços nem repagar. |
| `PUT /api/financial/{id}` | Não aceitar transição para pago. Formulário de edição oferece ação específica de baixa após salvar pendências; não encadear duas gravações silenciosamente. Rejeitar alteração de lançamento atualmente pago. |
| `POST /api/financial/{id}/mark-paid` | Exigir versão e chave; pagamento integral com autoria do servidor, conferência de pendente e comparação atômica. |
| Novo `POST /api/financial/{id}/reverse-payment` | Exigir versão, ID do pagamento ativo, chave e motivo de 3 a 500 caracteres após trim. Não estornar “qualquer pagamento mais recente” implicitamente. |
| Novo `GET /api/financial/{id}/payments` | Mostrar pagamentos e estornos, identificadores, datas, valores, autoria conhecida/legada; somente leitura e permissão financeira. |

Campos de pagamento enviados ao PUT com intenção de registrar baixa devem produzir erro explícito; não ignorar silenciosamente. Atualizar schemas, mensagens, frontend e todos os clientes/smokes no mesmo lançamento. Abas antigas precisam recarregar; não oferecer fallback que contorne a nova regra.

Uma criação paga deve exigir a permissão de criação e a de atualização financeira, igual à baixa. Reenvios também revalidam permissões atuais antes de revelar resultado. Autoria vem do `User` retornado por `require_permission`, nunca do corpo da requisição.

### Registro persistente

Implementar tabelas próprias, sem sobrescrever pagamento com estorno:

- **Pagamentos:** ID, lançamento com FK restritiva, tipo receita/despesa, total em centavos, data de pagamento, forma, instante de registro pelo servidor, identidade do autor e origem (`recorded` ou `legacy`). Preservar snapshot dos valores base/desconto/acréscimo do lançamento. Um pagamento não recebe UPDATE/DELETE comum.
- **Estornos:** ID, pagamento com FK restritiva e unicidade (no máximo um estorno por pagamento), instante do servidor, autor e motivo. Registro somente de acréscimo; motivo não pode ser editado depois.
- **Operações:** chave UUID única no namespace financeiro de pagamentos/estornos, tipo de operação, destino, hash canônico da intenção e ID do evento resultante. Recibo é durável; não apagar ao sair da sessão nem expirar para permitir repetição tardia. Criação paga usa a mesma infraestrutura e precisa recuperar o lançamento criado.
- **Lançamento:** referência ao pagamento ativo, nula quando pendente/cancelado. Uma baixa instala essa referência; estorno a remove. Status e referência devem ser consistentes ao final da transação. Impedir referência a pagamento de outro lançamento com integridade no banco.

Autor novo: ID e identificação de exibição capturada pelo servidor. Preservar a identificação histórica se o usuário for renomeado/excluído; não usar cascata que apague o evento. O identificador histórico pode ser snapshot sem FK mutável; a sessão é validada antes da operação. Nenhum hash de senha, token ou dado de sessão vai para a trilha. Não confundir essa identidade com snapshot completo de paciente/procedimento, reservado à 2B.5.3.

A imutabilidade deve ser protegida também contra UPDATE/DELETE normais nas tabelas de eventos (restrição/trigger), com teste direto no PostgreSQL. Isso não protege contra um administrador do banco que deliberadamente remova as restrições. A aplicação deve possuir um único caminho transacional para cada operação; sem commits intermediários do repositório atual.

### Repetição após perda de resposta

1. Validar autenticação, permissões e formato. Chave UUID criada no cliente uma vez por intenção, antes do envio.
2. Calcular hash canônico incluindo operação, destino, versão original e parâmetros explícitos normalizados. Normalizar UUID, enum e datas para UTC; distinguir data omitida de data resolvida pelo servidor. Não incluir o relógio atual no hash.
3. Consultar recibo **antes de rejeitar a versão antiga**, pois uma operação já aplicada naturalmente mudou a versão. Mesma chave/hash recupera o evento original. Chave igual com operação, destino, versão ou parâmetros diferentes: 409 `idempotency_conflict`.
4. Sem recibo, conferir versão/estado e gravar evento, referência ativa, versão e recibo numa única transação. Falha de validação, unicidade, FK ou conexão antes do commit não deixa evento órfão nem reserva permanente de chave.
5. Corridas da mesma chave precisam convergir para o mesmo evento; chaves diferentes disputando a mesma versão têm no máximo um vencedor. Tratar somente violações esperadas, sem converter qualquer erro SQL em sucesso. Após rollback, consultar recibo com nova leitura quando cabível.
6. Reenvio de baixa depois de estorno retorna o pagamento original **e o estado atual do lançamento**, indicando que o pagamento foi estornado; nunca reabre nem repaga. Mesma regra para reenvio de estorno depois de nova baixa.

Resposta dos endpoints de baixa/estorno deve incluir evento original imutável, lançamento atual e indicador de repetição. Criação/geração podem preservar envelope de lançamento, desde que exponham identificação/histórico e não afirmem que o pagamento antigo continua ativo. Recuperar evento não é devolver snapshot antigo do lançamento como se fosse estado atual.

Integração com `financial_generations`: recibos existentes permanecem válidos e com o hash original. Consultar recibo legado antes de exigir novas precondições que invalidariam reenvios já aceitos. Não regravar hashes antigos nem criar evento novo em repetição de geração. Novas gerações pagas gravam os dois recibos de modo atômico e recuperam ambos após disputa. Testar reenvio legado sem chave obrigatória de baixa, porque geração e baixa são operações diferentes.

### Permissão de estorno

Adicionar recurso específico `financial_reversals` à matriz, com `create` para estornar; demais ações desse recurso ficam sem rota de mutação. Estorno também exige `financial.update`. Administrador mantém seu acesso; para perfis existentes não administradores, o recurso novo começa negado e pode ser concedido na administração de permissões. **Não herdar automaticamente poder de estorno de `financial.update` ou `financial.delete`.**

Atualizar backend, tipos frontend, nomes visíveis e tela de permissões juntos. Testar matriz antiga preservada, recurso novo negado e concessão/revogação efetiva. Consulta da trilha usa `financial.view`; usuário sem permissão não recupera evento por chave. A restrição inicial pode ser reavaliada para o uso da clínica sem alterar o histórico.

### Interface e falhas de rede

- Baixar abre confirmação com total, data e forma; despesas usam linguagem de pagamento, receitas de recebimento. A submissão mantém chave e conteúdo enquanto o resultado estiver incerto.
- Em timeout/perda da resposta, oferecer “Consultar/repetir esta operação” com a mesma chave e parâmetros. Não trocar chave automaticamente nem alterar valor/data enquanto a tentativa estiver incerta. Se usuário sair e voltar, oferecer conferência do histórico antes de nova ação.
- Persistir somente metadados mínimos da tentativa no escopo da sessão do usuário; não compartilhar tentativa entre logins. Definir limpeza na troca de usuário/expiração e testar regressão de isolamento da etapa 1B. Não guardar credenciais nem snapshot clínico.
- Conflito de versão real mantém revisão explícita da 2B.5.1. Recuperação de recibo não gera toast afirmando novo pagamento quando foi apenas repetição.
- Pago oferece “Ver pagamentos” e, se autorizado, “Estornar registro”; edição/exclusão ficam indisponíveis com explicação. O servidor impõe a mesma regra.
- Estorno mostra exatamente qual pagamento será desfeito e exige motivo. Após sucesso, atualizar lista, resumo e histórico. Nunca executar estorno automaticamente após erro de baixa.
- Consulta mínima da trilha entra nesta entrega para tornar correções compreensíveis. Relatório histórico abrangente, snapshots de referências e filtros adicionais continuam na 2B.5.3.

## Migração e dados legados

### Levantamento executado nesta preparação

Consulta SQL agregada e somente leitura em `erp-dents-homolog`: revisão `0019`, um lançamento pago. Zero pagos sem data, não pagos com data, valores negativos/totais divergentes, pagos sem forma e totais zero. Nenhuma linha individual, descrição, vínculo ou identidade foi extraída. Isso verifica apenas a pequena base fictícia local; não comprova compatibilidade de bases de outras instalações.

Inspeção de código confirmou ausência de autoria financeira e commits próprios em `create`, `create_generated` e `update`. A transação futura não pode chamar esses métodos e acrescentar evento depois do commit. Confirmados quatro caminhos para estado pago e ausência de permissão específica de estorno.

### Política para a migração seguinte

1. Salvar dump, arquivos e fingerprints antes de atualizar. Ensaiar migração em schema isolado com pagamentos legados fictícios e dados inconsistentes deliberados. Não alterar a homologação principal até testes focados aprovarem.
2. Criar um pagamento `legacy` para cada lançamento atualmente pago. Copiar exatamente valores, tipo, data e forma existentes. Autor nulo e rótulo “Registro anterior ao histórico”; instante da importação separado da data do pagamento. Não atribuir o passado ao administrador que executou a migração. Não tentar reconstruir pagamentos previamente apagados/reabertos.
3. Pendentes/cancelados não ganham eventos inventados. Versão, status, valores, datas, vínculos e recibos existentes permanecem; apenas referências/tabelas novas são adicionadas.
4. Pago com data ausente ou qualquer valor negativo/total divergente: **abortar transacionalmente**, com diagnóstico agregado sem dados pessoais; não preencher agora, corrigir silenciosamente nem migrar só parte. Não pago com `paid_at` também bloqueia para revisão explícita. Forma ausente e total zero são suportados como existentes, sem inferência. Testar esses limites em fixtures.
5. Antes de importar, verificar a relação entre cada pagamento ativo e o lançamento. Restrições finais precisam impedir múltiplos pagamentos ativos e exclusão física de lançamento com qualquer histórico, inclusive estornado.
6. Downgrade destrutivo deve recusar remoção da trilha quando houver eventos novos; não oferecer migração reversa que descarte pagamentos. Reversão operacional será restauração ensaiada do backup anterior com serviços parados, advertindo que perderia alterações posteriores. Não executar restauração sobre dados novos como rotina de atualização.

## Matriz de aceite da implementação

| Camada | Evidência obrigatória |
| --- | --- |
| Migração | Legados pagos importados sem autor inventado; datas/frações/valores/forma nula/zero preservados; inconsistências abortam sem efeitos parciais; recibos antigos e dados/exames preservados. |
| PostgreSQL | Baixa×baixa mesma chave e chaves diferentes, baixa×edição/exclusão/cancelamento, estorno×estorno, estorno×edição; no máximo um evento por operação/versão. Testar INSERT do evento falhando depois da alteração do lançamento, com rollback de tudo. |
| Integridade | Eventos rejeitam UPDATE/DELETE; lançamento com histórico não pode ser apagado; pagamento ativo pertence ao lançamento e combina com status; estorno único por pagamento. |
| Idempotência | Mesma chave/hash retorna mesmo evento entre sessões/reinício; chave alterada retorna conflito; reenvios após estorno/nova baixa não mudam estado atual. Data omitida não muda hash a cada tentativa. |
| Quatro caminhos | Criação paga, geração paga e baixa produzem evento/autoria/recibo; PUT não contorna pagamento nem imutabilidade; chamadas diretas cobertas além da tela. |
| Permissões | Autor autenticado apesar de campos falsificados; anônimo/leitura negados; novo estorno negado por padrão a não admin; concessão/revogação testadas; recuperação revalida acesso. |
| Geração 2A.2 | Mesma chave original recupera lançamento atual; pago/estornado/cancelado não recriam; hashes antigos e tombstones preservados; unicidade ativa continua. |
| Interface | Chave mantida em resposta perdida, rascunho preservado, botões coordenados, histórico/legado claros, motivo obrigatório, lista/resumo/histórico coerentes. |
| Chrome HTTPS | Interceptar perda de resposta após commit de baixa/estorno; reenviar e conferir um evento; duas abas em disputa; conferir ausência de contorno via edição e fluxo completo estornar/corrigir/baixar novamente. |
| Entrega | Backend/frontend completos, smokes HTTP, builds, CI e auditorias; fixtures limpas; backups/fingerprints; commit/push e HEAD remoto. |

## Ordem de execução e ponto de retomada

**Esta preparação é somente documental.** Nenhuma regra de produto ou migração foi alterada; nenhum teste novo de API ou navegador foi executado. A regressão aprovada permanece [CI 35719559295](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35719559295), com 177 backend/56 frontend. A consulta agregada acima é inspeção do banco, não aprovação do contrato futuro.

Próximo recorte: **2B.5.2.1 — implementação conjunta do contrato**. Começar por fixtures legadas e testes transacionais/recibos; implementar migração/repositório sem commits intermediários, casos de uso/rotas/autoria e restrições de todos os caminhos. Depois atualizar frontend/permissões/smokes, validar em ambiente descartável e somente então atualizar homologação principal com cópias prévias. Pode haver checkpoints de trabalho, mas não publicar como entrega funcional uma API nova com UI antiga ou um caminho pago sem proteção.

Não iniciar a 2B.5.3 nem encerrar R26 antes dessa implementação e de seus critérios. Evitar repetir o diagnóstico de concorrência já resolvido pela 2B.5.1.
