# Etapa 2A.2 — geração de cobrança sem duplicação

Base `b1e36c7`. Corrige R17: a verificação de lançamento ativo era uma consulta seguida de gravação, permitindo duas criações simultâneas. A reprodução em PostgreSQL na revisão anterior confirmou duas cobranças aceitas após ambas passarem pela verificação.

## Contrato e implementação

- Migração `0013_financial_generation`: índice único parcial `uq_financial_active_appointment`, com uma cobrança não cancelada por consulta vinculada. Vale para criação manual, geração, edição de vínculo e reativação, inclusive por escrita direta. Pendentes e pagas ocupam o vínculo; lançamentos sem consulta continuam independentes.
- Geração aceita `idempotency_key` UUID opcional no corpo. O navegador gera uma chave por tentativa, mantém a chave após erro com os mesmos dados e troca quando os dados mudam ou após sucesso. Clientes antigos sem chave continuam recebendo 409 ao repetir a criação.
- `financial_generations` persiste chave, SHA-256 da consulta/parâmetros recebidos e referência ao lançamento. Não armazena o corpo da requisição. Cobrança e registro de repetição são gravados na mesma transação; conflito de chave desfaz a cobrança perdedora.
- Mesma chave e mesmos parâmetros retornam o mesmo lançamento, com seu estado atual e HTTP 201, inclusive depois de outro login. Mesma chave com parâmetros diferentes retorna 409. Operações diferentes para a mesma consulta também retornam 409 enquanto houver cobrança ativa.
- Reenvio não recalcula preços nem sobrescreve pagamento, notas ou cancelamento. Cancelar permite uma nova operação com outra chave. A chave antiga continua apontando ao lançamento cancelado. Excluir mantém a chave com referência nula: reenvio retorna 409 e não recria a cobrança.
- O registro de repetição não é trilha de auditoria financeira. Pagamentos, estornos, autoria e controle de edição permanecem na 2B. Não há parcelamento nesta entrega.

## Atualização e preservação

A migração bloqueia a tabela durante a conferência e criação do índice. Reserve janela de atualização. Duplicações antigas interrompem a migração sem escolher, cancelar ou excluir cobranças. A correção desses registros exige revisão local pelo responsável; não remover volumes para contornar a falha.

Antes da atualização principal foram salvos banco, exames e fingerprints em `.data/homolog/pre-2A2.*`. A comparação desconsidera apenas metadados de autenticação, versão de esquema e a tabela nova de repetição. Não publicar backups, credenciais ou certificados. Downgrade remove índice e registros de repetição, portanto perde essa garantia para reenvios antigos; não usá-lo como correção de dados.

## Validação

- 11 testes PostgreSQL focados aprovados, com conexões independentes e barreiras: reprodução anterior, migração recusada/preservação, criação manual, mesma chave, chaves distintas, chave reaproveitada em outra consulta com rollback, consultas independentes, reativação, registros sem vínculo, reenvio após pagamento/cancelamento e exclusão.
- 11 grupos HTTP aprovados, incluindo bootstrap e limpeza: mesma chave simultânea, repetição com outro login, parâmetros divergentes, nova operação, estados financeiros e exclusão.
- 42 testes frontend aprovados; builds API/web aprovados.
- 10 grupos do fluxo geral aprovados após atualizar a homologação.
- Suíte backend completa: **119 testes aprovados**, incluindo PostgreSQL e ClamAV.
- Chrome/HTTPS: resposta perdida depois de commit, rascunho preservado, reenvio com a mesma chave e mesmo ID; consulta à API confirma exatamente uma cobrança. Captura conferida. Teste corrigido para usar CA explícita no Node e papel acessível `status` da notificação de sucesso; callback de interceptação trata erros sem imprimir cabeçalhos. Sessão de teste interrompido revogada e fixtures removidas.
- Homologação principal em `0013_financial_generation`; fingerprints confirmaram registros anteriores e bytes dos exames preservados após atualização e smokes. Registros de repetição dos testes permanecem sem referência após limpar as cobranças fictícias.
- CI remoto: registrar resultado no fechamento antes de considerar concluída.

Comandos específicos:

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 api python -m unittest discover -s tests -p test_financial_concurrency.py -v
python scripts/smoke_financial_homolog.py
$env:NODE_EXTRA_CA_CERTS = (Resolve-Path '.data/tls/homolog/ca.crt').Path
node scripts/smoke_financial_browser_homolog.cjs
```

O teste Chrome requer Playwright (`PLAYWRIGHT_MODULE` se instalado fora do projeto), CA confiável no Windows e no Node. Simula perda de resposta após commit e repete pelo formulário. Dados exclusivamente fictícios; fixtures removidas pela API, preservando os registros de repetição sem referência. Não executar smokes de API descartável simultaneamente na porta 18001.

## Limites

A chave no formulário dura enquanto a página está montada. Após recarregar/abrir outro computador, uma nova chave ainda encontra a proteção de unicidade e recebe 409; consulte o financeiro para verificar o resultado. Não há armazenamento de rascunho ou chave em localStorage. As chaves persistidas no servidor não expiram nesta etapa.

Idempotência garante o efeito único daquela operação, não uma cópia imutável da resposta: o resultado reflete alterações posteriores no lançamento. A regra atual de uma cobrança ativa por consulta deverá ser revista junto com a modelagem de parcelas, na etapa 4. Próximo recorte: 2B — edição concorrente e histórico financeiro.
