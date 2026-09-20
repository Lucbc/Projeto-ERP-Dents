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
- **46 testes frontend distintos aprovados:** os 45 anteriores e o novo componente de dentistas. Este exercita conflito, especialidade e linhas de horários preservadas, falha de recarga, substituição explícita e gravação com a versão carregada.
- **10 grupos HTTP específicos** e **10 do fluxo geral** aprovados; a API descartável confirmou também versão obrigatória e bloqueio de reativação antiga.
- **Chrome/HTTPS:** duas abas abriram o mesmo dentista. A primeira salvou horários; a segunda recebeu 409 e manteve especialidade divergente e duas linhas de disponibilidade. Recarga recuperou a especialidade/horário salvo e removeu a linha extra do rascunho. Revisão posterior chegou à versão 3, sem misturar dados. Capturas locais conferidas; fixtures removidas pela API.
- Builds Docker API/web aprovados. Suíte backend completa: **147 testes aprovados**, incluindo PostgreSQL e ClamAV. Zero schemas de teste restantes.
- Implementação `9e85823` publicada no `origin/main`; [CI 35467879087](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35467879087) aprovou 147 backend, 46 frontend, builds e smokes de dentistas, mas falhou no timeout do gateway. O fechamento depende da correção abaixo e de novo CI aprovado.

### Pendência encontrada no CI e retomada em 20/09/2026

O smoke de upload incompleto recebeu `RemoteDisconnected`, sem resposta HTTP. A falha foi reproduzida localmente com a configuração original: API, gateway e HTTPS tinham prazos de 30 segundos. O fechamento pelo proxy pode anteceder o JSON 408 da API; o [registro oficial do Nginx](https://trac.nginx.org/nginx/ticket/1005) descreve o encerramento sem resposta no próprio timeout. O log remoto não identifica qual dos dois proxies venceu a disputa.

API mantém prazo total de corpo em 30s. Gateway passa a 45s e HTTPS a 60s para inatividade de corpo/envio ao upstream, permitindo que a API responda primeiro. Templates compartilhados pelos ambientes foram ajustados, e os dois proxies da homologação foram recriados. Smoke agora exige resposta JSON 408 nas duas conexões em menos de 35s e confirma que nova requisição completa alcança validação, comprovando liberação de vagas. Não aceita desconexão como sucesso nem aumenta a tolerância de tempo do teste.

Validação local após correção aprovada: duas respostas JSON 408 em 30,016s, vagas liberadas, 413/503 e 80 chamadas de saúde com oito clientes, p95 de 2,078s. Sintaxe dos dois Nginx aprovada. Novo CI ainda pendente neste checkpoint; sem alteração de API ou nova migração nesse complemento.

O [CI 35487443934](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35487443934), da correção `5ff12bd`, parou antes do smoke do gateway: três disputas reais de agenda produziram SQLSTATE `40P01` (deadlock nas restrições de exclusão), enquanto o teste só aceitava `23P01`. A API já classificava ambos como 409 com rollback; não houve mudança nessa política. O teste passa a admitir especificamente os dois estados, verifica a classificação HTTP e confirma uma única criação, preservação do reagendamento perdedor e uma única reativação. O smoke HTTP aceita as duas mensagens seguras e mantém a exigência de um vencedor/um 409 e zero sobreposições no banco. Validação local: 11 testes focados de agenda e 12 grupos HTTP aprovados. Publicar este ajuste de testes e acompanhar novo CI.

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
