# Etapa 2B.3 — edição concorrente de dentistas

Base `1e9415e`. Terceiro recorte de R18: impedir que um formulário antigo sobrescreva dados, especialidade textual ou disponibilidade de um dentista.

## Contrato

- Migração `0016_dentist_version`: coluna positiva `dentists.version`, inicialmente 1, preservando os campos existentes.
- Criação, leitura e listagem retornam versão. `PUT /api/dentists/{id}` exige inteiro positivo `version`; precondição ausente/inválida retorna 422. Versão antiga retorna 409; registro inexistente, 404. Frontend e API precisam atualizar juntos; recarregar abas antigas.
- O banco compara e incrementa versão no mesmo UPDATE. Campos enviados, especialidade e toda a lista de horários são gravados juntos; campos omitidos ficam intactos. A proteção inclui ativação/inativação. Envio sem alterações também consome versão; repetir uma edição já salva exige consultar o registro atual.
- O formulário conserva a versão original e o rascunho em conflito. **Descartar rascunho e carregar atual** substitui os campos e horários somente após leitura bem-sucedida. Falha na leitura mantém o rascunho. Não há mesclagem nem reenvio automático.
- Salvar, recarregar, cancelar e fechar o modal ficam coordenados durante as requisições de gravação/recarga. Exclusão permanece sem precondição de versão e requer política própria.

## Preservação e atualização

Homologação atualizada em `https://localhost:18443`, com banco em `0016_dentist_version`. Cópias locais prévias de banco/exames e fingerprints: `.data/homolog/pre-2B3.dump`, `pre-2B3-exams.tar` e `pre-2B3-state.json`. Comparação após atualização e smokes confirmou os campos anteriores de todas as tabelas de negócio e os bytes dos exames. Exclui autenticação, revisão Alembic e somente a nova coluna de versão de dentistas.

A migração adiciona coluna/restrição com bloqueio da tabela: reservar janela de atualização. Downgrade remove os números de versão e a proteção, sem restaurar valores de negócio anteriores. Não usar para contornar conflitos. Nenhum volume foi removido; credenciais, cópias e certificados permanecem fora do Git.

## Validação

- **10 testes PostgreSQL focados aprovados:** conexões simultâneas com a mesma versão; perfil/especialidade/horários do vencedor; rascunho antigo; revisão parcial; ativação antiga; repetição sem mudanças; precondições inválidas; rollback de falha de banco; horários inválidos; listagem; exclusão anterior; migração preservando registros. Alguns testes agrupam mais de um cenário.
- **46 testes frontend distintos aprovados:** os 45 anteriores e o novo componente de dentistas. Este exercita conflito, especialidade e linhas de horários preservadas, falha de recarga, substituição explícita e gravação com a versão carregada. O mock inicial do catálogo retornava um array em vez de `{items,total}`; corrigido e o teste passou.
- **10 grupos HTTP específicos** e **10 do fluxo geral** aprovados; a API descartável confirmou também versão obrigatória e bloqueio de reativação antiga.
- **Chrome/HTTPS:** duas abas abriram o mesmo dentista. A primeira salvou horários; a segunda recebeu 409 e manteve especialidade divergente e duas linhas de disponibilidade. Recarga recuperou a especialidade/horário salvo e removeu a linha extra do rascunho. Revisão posterior chegou à versão 3, sem misturar dados. Capturas locais conferidas; fixtures removidas pela API.
- Builds Docker API/web aprovados. Suíte backend completa e CI remoto ainda em andamento no checkpoint inicial desta entrega.

Comandos específicos:

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 api python -m unittest discover -s tests -p test_dentist_version.py -v
python scripts/smoke_dentist_version_homolog.py
node scripts/smoke_dentist_version_browser_homolog.cjs
```

Chrome/Playwright requerem a CA local confiável e `PLAYWRIGHT_MODULE` quando instalado fora do projeto. Não há aceite de certificado pendente. APIs descartáveis usam porta 18001; não executar seus smokes simultaneamente.

## Limites e próximo recorte

A especialidade do dentista é um texto no registro; esta entrega protege esse valor, sem transformar o campo em vínculo com o catálogo. Não resolve renomeação/exclusão de especialidades nem valida mudanças de disponibilidade contra consultas já marcadas ou criadas simultaneamente. Essas regras entre recursos precisam de recorte próprio.

R18 está parcialmente tratado para edição de pacientes, consultas e dentistas pela API. Catálogos, administração/permissões, exclusões e histórico financeiro permanecem pendentes. Escritas externas à API devem incrementar versão; não existe trigger para ferramentas de manutenção. Rascunhos ficam apenas na memória da página; atualização automática entre computadores e melhorias gerais de telas continuam na etapa 3.

Próximo recorte proposto: **2B.4 — edição concorrente dos catálogos de procedimentos e especialidades**. Histórico financeiro, baixa e estorno permanecem separados. Não considerar toda a 2B concluída.
