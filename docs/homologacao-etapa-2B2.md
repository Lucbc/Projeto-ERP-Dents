# Etapa 2B.2 — edição concorrente da agenda

Base `aa316c9`. Segundo recorte de R18: proteção da edição de consultas pela lista e pelo calendário. As restrições de sobreposição da 2A.1 permanecem.

## Contrato

- Migração `0015_appointment_version`: coluna positiva `appointments.version`, inicialmente 1, sem alterar horários, status ou vínculos existentes.
- Criação/listagem/leitura retornam versão. `PUT /api/appointments/{id}` exige inteiro positivo `version`; precondição ausente ou inválida recebe 422. Versão antiga recebe 409; consulta inexistente, 404. Clientes antigos precisam atualizar e recarregar.
- A aplicação recusa versões já antigas antes de validar a edição. O banco compara e incrementa versão no mesmo UPDATE, protegendo também a disputa que ocorre depois das validações. A gravação da linha precede a troca de procedimentos; tudo é confirmado na mesma transação. Falha de sobreposição ou vínculo inválido não consome versão nem deixa alterações parciais.
- Aplica-se a reagendamento, notas, paciente, dentista, procedimentos, status, cancelamento e reativação pela edição. Envio sem alterações também incrementa versão; repetir a operação antiga recebe conflito.
- Lista e calendário guardam a versão que originou o formulário. Em 409, preservam dados, datas e seleção de procedimentos. **Descartar rascunho e carregar atual** é uma ação explícita; falha de leitura mantém o rascunho. Recarga bem-sucedida usa a versão nova e mantém a duração salva, sem reaplicar automaticamente a sugestão dos procedimentos. Não há mesclagem ou reenvio automático.
- Ações de salvar, excluir no modal, cancelar e fechar ficam coordenadas enquanto salvar/carregar/excluir está em andamento. A exclusão ainda não exige versão; sua política permanece pendente.

## Preservação e atualização

API/frontend atualizados juntos na homologação. Cópias locais prévias `.data/homolog/pre-2B2.dump`, `pre-2B2-exams.tar` e fingerprints. Comparação ignora autenticação, revisão Alembic e a nova coluna de versão; confirma todos os campos anteriores, vínculos de procedimentos e bytes dos exames. Não publicar cópias, credenciais ou certificados.

Migração adiciona coluna/restrição com bloqueio de tabela; reservar janela de atualização. Downgrade remove a proteção e os números de versão, sem reverter dados de negócio. Não usar para contornar conflito de edição.

## Validação

- **10 testes PostgreSQL focados aprovados:** disputa após ambas as validações, conjunto vencedor de campos/vínculos, cancelamento/reativação antigos, recarga e edição parcial, rollback de sobreposição e FK, envio sem alteração, precondições inválidas, exclusão anterior, listagem e migração preservando registros/vínculos.
- **45 testes frontend aprovados**, incluindo os dois formulários com conflito, preservação de datas/procedimentos, falha de recarga, recarga explícita e versão correta na revisão. O teste de componente substitui apenas o widget externo do calendário; o calendário real também foi exercitado no Chrome.
- **10 grupos HTTP específicos**, **12 da proteção de sobreposição** e **10 do fluxo geral** aprovados. Testes históricos usam colunas explícitas para funcionar sem a coluna nova, mantendo a reprodução anterior das sobreposições.
- **Chrome/HTTPS:** duas abas com lista e calendário. Lista salva e calendário rejeita versão antiga, mantendo seleção de procedimento divergente; recarga recupera a seleção gravada. Fluxo inverso também passou, com conflito na lista após edição pelo calendário. Revisões chegaram à versão 5, sem misturar campos/vínculos. Capturas conferidas e fixtures removidas pela API.
- Homologação principal em `0015_appointment_version`; fingerprints aprovados após migração e smokes.
- Suíte backend completa: **137 testes aprovados**, incluindo PostgreSQL e ClamAV.
- **CI remoto aprovado:** implementação `4a434d5`, [GitHub Actions 35460555407](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35460555407), em 8min56s. Confirmados 137 testes backend, 45 frontend, HTTP, builds e auditorias. Gateway passou 413/503/408 e 80 chamadas de saúde. Zero schemas de teste restantes na homologação. Etapa 2B.2 concluída em 19/09/2026; fechamento posterior somente documental.

Comandos específicos:

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 api python -m unittest discover -s tests -p test_appointment_version.py -v
python scripts/smoke_appointment_version_homolog.py
python scripts/smoke_agenda_homolog.py
node scripts/smoke_appointment_version_browser_homolog.cjs
```

Chrome/Playwright requerem a CA local confiável e `PLAYWRIGHT_MODULE` quando a dependência estiver fora do projeto. Não há aceite de certificado pendente. APIs descartáveis usam porta 18001; não rodar esses smokes em paralelo.

## Limites e próximo recorte

R18 está tratado para edição de pacientes e consultas pela API. Exclusões, demais cadastros, administração/permissões e histórico financeiro ainda exigem recortes próprios. Escritas de manutenção externas à API devem incrementar a versão; não há trigger para ferramentas externas. Alterações concorrentes da disponibilidade do dentista não fazem parte deste recorte.

Rascunho fica na memória da página, sem persistir ao fechar/recarregar. Resposta perdida de uma edição já salva gera conflito no reenvio: conferir a consulta atual antes de revisar. Esta entrega não implementa atualização automática entre computadores nem resolve a rolagem horizontal da lista, que permanecem na etapa 3.

Próximo recorte proposto: **2B.3 — controle de edição dos demais cadastros**, começando por dentistas e seus vínculos/disponibilidade. Histórico financeiro/baixa/estornos permanecem em recorte separado. Não considerar toda a 2B concluída.
