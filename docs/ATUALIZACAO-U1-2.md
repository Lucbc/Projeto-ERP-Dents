# U1.2 — busca de pacientes

Iniciada em 16/10/2026, base `08004e5`. Em validação; versão de instalação continua `piloto-cadastros-v0.1.1` até concluir os aceites.

## Mudanças

- Nome social/preferido passa a participar da mesma busca, sem distinção de maiúsculas/minúsculas, como o nome completo.
- CPF pode ser pesquisado com ou sem pontos, hífen e espaços, inclusive por trecho numérico. O valor cadastrado não é regravado.
- A busca normalizada por CPF só é adicionada se o termo contiver dígitos e for composto de números, pontos, hífens e espaços. Texto misturado com números continua sendo texto; pontuação isolada não vira uma busca numérica vazia.
- Demais campos e paginação mantidos. Não inclui normalização de telefone nem remoção de acentos dos nomes. Não há alteração de dependências, configuração ou esquema do banco.

## Validação

- PostgreSQL privado: teste `test_patient_search_db.py` aprovado (3,358 s), cobrindo os dois formatos de CPF armazenado, buscas parciais, nome social, contagem/páginas, campos anteriores, ausência de resultados e preservação dos valores.
- Imagem da API construída em `erp-dents-homolog`; containers principais não atualizados.
- Chrome/API aprovados: ensaio ampliado verifica resposta HTTP e identificador do paciente na busca por CPF numérico e nome social, com perfil restrito de recepção. Cadastro, conflito, reabertura e navegação acima de 100 registros continuam aprovados. Recursos privados limpos e origem preservada. Regressão completa no CI ainda pendente.
- Logs locais ignorados: `.data/search-db.log`, `.data/search-build.log`, `.data/search-browser.log`.

## Retomada

Implementação enviada no commit `a464613`. Acompanhar [CI 38902882227](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/38902882227), em execução no registro deste checkpoint; registrar resultado antes de publicar nova tag. Manter a liberação anterior e não atualizar o servidor da clínica nesta etapa. Após aceite, corrigir os limites de busca no roteiro/liberação. Dados físicos do servidor continuam aguardando confirmação do usuário. Não repetir PostgreSQL/Chrome aprovados sem mudança ou falha que justifique.
