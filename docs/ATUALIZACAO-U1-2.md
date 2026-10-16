# U1.2 — busca de pacientes

Concluída em 16/10/2026, base `08004e5`, implementação `a464613`. Liberada no piloto como `piloto-cadastros-v0.1.2`; tags anteriores preservadas.

## Mudanças

- Nome social/preferido passa a participar da mesma busca, sem distinção de maiúsculas/minúsculas, como o nome completo.
- CPF pode ser pesquisado com ou sem pontos, hífen e espaços, inclusive por trecho numérico. O valor cadastrado não é regravado.
- A busca normalizada por CPF só é adicionada se o termo contiver dígitos e for composto de números, pontos, hífens e espaços. Texto misturado com números continua sendo texto; pontuação isolada não vira uma busca numérica vazia.
- Demais campos e paginação mantidos. Não inclui normalização de telefone nem remoção de acentos dos nomes. Não há alteração de dependências, configuração ou esquema do banco.

## Validação

- PostgreSQL privado: teste `test_patient_search_db.py` aprovado (3,358 s), cobrindo os dois formatos de CPF armazenado, buscas parciais, nome social, contagem/páginas, campos anteriores, ausência de resultados e preservação dos valores.
- Imagem da API construída em `erp-dents-homolog`; containers principais não atualizados.
- Chrome/API aprovados: ensaio ampliado verifica resposta HTTP e identificador do paciente na busca por CPF numérico e nome social, com perfil restrito de recepção. Cadastro, conflito, reabertura e navegação acima de 100 registros continuam aprovados. Recursos privados limpos e origem preservada.
- [CI 38902882227](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/38902882227) aprovado: 309 testes backend, 381 frontend, build, regressões HTTP e auditorias de dependências/imagens. Log local ignorado `.data/search-ci.log`.
- Logs locais ignorados: `.data/search-db.log`, `.data/search-build.log`, `.data/search-browser.log`.

## Retomada

Roteiro e limites atualizados para `piloto-cadastros-v0.1.2`. Não houve atualização dos containers principais ou do servidor da clínica; para instalação nova seguir o roteiro, para instalação existente usar janela assistida com backup. Instalação vazia e recuperação continuam apoiadas nos aceites da versão inicial, sem repetição nesta alteração de consulta. Dados físicos do servidor aguardam confirmação do usuário. Próximo: P3 físico quando disponíveis e preparação do procedimento P4 de atualização semanal, com preservação de configuração/volumes, backup e verificação antes de reabrir. Não repetir PostgreSQL/Chrome aprovados sem mudança ou falha que justifique.
