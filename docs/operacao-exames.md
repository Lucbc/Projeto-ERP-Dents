# Operação de exames — complemento 1D.1

Implementado em 17/09/2026, base `2ed2c84`. Este documento substitui as pendências técnicas de reconciliação, quota, concorrência, proxy e antivírus do relatório inicial 1D.1.

## Funcionamento padrão

| Proteção | Comportamento |
|---|---|
| Tamanho | PDF/JPG/PNG até 20 MiB; corpo multipart até esse limite mais 64 KiB |
| Quota | 50 GiB de conteúdo armazenado, incluindo arquivos antigos e quarentena; configurável |
| Concorrência | Até dois envios simultâneos no gateway e por processo da API; confirmação de arquivo/metadados serializada entre processos pelo PostgreSQL |
| Tempo | Até 30 segundos para receber o corpo na API; antivírus com prazo total de 40 segundos; proxy aguarda resposta por até 120 segundos |
| Antivírus | ClamAV local obrigatório antes de publicar novos arquivos e antes de liberar downloads, inclusive legados |
| Falha do antivírus | Arquivo não é liberado; resposta 503. Detecção de ameaça ou limite de análise excedido bloqueia o arquivo com 400 |
| Atualização | FreshClam mantém assinaturas em volume persistente. A API rejeita assinaturas com mais de sete dias |
| Manutenção | Inicia com a API e repete a cada cinco minutos; falha/ocupação é tentada novamente no ciclo seguinte |
| Arquivos órfãos | Sem referência no banco e com pelo menos 24 horas: movidos para `.quarantine/<paciente>/<arquivo>` no mesmo volume, sem apagar os bytes |
| Arquivos ausentes | Metadados preservados e ocorrência contada; exige recuperar o arquivo de uma cópia válida |

Não há descarte automático da quarentena. Isso preserva a possibilidade de recuperação e evita escolher um prazo clínico de retenção sem definição da clínica. A quarentena continua consumindo quota. O comando de recuperação restaura o arquivo físico; não inventa paciente, nome original, notas ou vínculo que tenham sido perdidos no banco.

A checagem e a publicação usam um bloqueio persistido pelo PostgreSQL, liberado automaticamente quando a conexão cai. Manutenção e exclusões usam o mesmo bloqueio: um upload ainda em confirmação não vira órfão durante a varredura, e uma exclusão não disputa o arquivo com a quarentena. Se estiver ocupado, a operação retorna 503 para ser tentada novamente. A quota conta os arquivos físicos, inclusive resíduos de uma queda. Falhas conhecidas de disco recebem erro controlado, e a API também verifica espaço livre antes de gravar.

## Docker e configuração

Os três ambientes Compose incluem `clamav` e `gateway`. A porta pública da API passou para o gateway; as URLs dos usuários continuam iguais. A API e o antivírus não publicam portas diretamente no computador. O gateway resolve novamente o endereço da API pelo DNS do Docker após recriações.

Cabeçalhos encaminhados pelo cliente continuam sem confiança na API. O orçamento de tentativas por origem passa a ser compartilhado por quem chega pelo gateway; o limite por conta continua independente. Ajustes de origem confiável exigem configuração própria do proxy, sem aceitar cabeçalhos arbitrários.

```powershell
./scripts/homolog.ps1 -Action up
./scripts/homolog.ps1 -Action status
```

No arquivo de ambiente do servidor:

```dotenv
EXAM_MAX_BYTES=20971520
EXAM_QUOTA_BYTES=53687091200
```

Recrie os serviços pelo Compose após alterar os limites; API e gateway recebem o mesmo limite de arquivo. A quota precisa ser pelo menos o tamanho máximo de um arquivo. Para testar a manutenção em uma API isolada, `EXAM_MAINTENANCE_SECONDS` aceita 10 a 3.600 segundos; nos Compose entregues o intervalo padrão é 300.

O ClamAV usa imagem oficial fixada por digest, volume de assinaturas separado por ambiente e limite de 4 GiB de RAM. Reserve recursos também para banco/API/web; este conjunto foi testado em Docker com aproximadamente 8 GiB disponíveis. A primeira inicialização aguarda o antivírus ficar saudável. O servidor precisa conseguir atualizar assinaturas; conteúdo de exames não é enviado a serviços externos. [Requisitos e atualização da imagem oficial](https://docs.clamav.net/manual/Installing/Docker.html).

A conexão ao antivírus usa INSTREAM, com blocos de 64 KiB. O serviço bloqueia documentos criptografados e análises que ultrapassem seus limites; a aplicação só aceita resposta explícita de arquivo limpo. [Protocolo oficial do ClamAV](https://docs.clamav.net/manual/Usage/ClamdProtocol.html). Nenhum antivírus garante detectar toda ameaça; a restrição de formatos, download como anexo e prévia somente de imagens continuam aplicadas.

## Diagnóstico e recuperação

Executar manutenção manual e obter contagens:

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml exec api python -m scripts.maintain_exams
```

O resultado informa remoções confirmadas, falhas pendentes, arquivos em quarentena neste ciclo, órfãos recentes, referências sem arquivo, entradas inseguras e bytes utilizados. Falhas, referências ausentes ou entradas inseguras retornam código de saída 1. Ocorrências na manutenção automática aparecem nos logs apenas como contagens, sem nomes/conteúdo de pacientes.

Para restaurar um arquivo conhecido da quarentena, usando o ID e o nome armazenado encontrados na cópia/volume:

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml exec api python -m scripts.maintain_exams --restore-patient ID-DO-PACIENTE --restore-file NOME-ARMAZENADO.png
```

O comando recusa sobrepor arquivo existente e bloqueia caminhos fora do armazenamento. A restauração devolve os mesmos bytes ao local original e renova o prazo de 24 horas. Se faltam os metadados, recupere o vínculo por restauração consistente do banco ou por novo envio autorizado. Não remova a quarentena para contornar quota; confira os arquivos e a política de retenção da clínica antes de qualquer descarte.

Verificar antivírus e sua versão de assinaturas:

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml exec clamav clamdscan --version
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml logs --tail 40 clamav
```

Se a quota estiver cheia, revise capacidade e quarentena com o responsável. Aumentar `EXAM_QUOTA_BYTES` não cria espaço físico. Se o antivírus estiver indisponível/desatualizado, corrija sua execução/conexão de atualização; o aplicativo não oferece opção de ignorar a verificação.

## Validação desta entrega

- **78 testes de backend aprovados** na suíte completa. Após os últimos ajustes de integração, os 14 testes de operação foram executados novamente e passaram. Não houve alteração de frontend; os 34 testes da entrega anterior continuam como referência, sem nova execução nesta entrega.

- Testes de banco/armazenamento: quarentena de órfão antigo, preservação de arquivos recentes/referenciados, recuperação byte a byte, recusa de sobrescrita/traversal, arquivo ausente, symlinks, quota incluindo quarentena e bloqueio entre conexões independentes.
- Testes do scanner: resposta limpa, detecção, resposta inesperada/incompleta, falha de conexão e assinaturas vencidas. ClamAV real aprovou PNG limpo e rejeitou a amostra inofensiva EICAR.
- HTTP isolado: quota com seis uploads concorrentes, recuperação de capacidade após exclusão, rejeição de EICAR, download legado bloqueado e indisponibilidade do antivírus sem perda de metadados. A manutenção periódica e a restauração por CLI têm cenário próprio.
- Gateway: 80 chamadas de saúde com oito clientes, p95 de 0,093 s no ensaio; 413 para corpo excessivo, 503 para terceiro envio simultâneo, 408 para envio incompleto e saúde disponível durante a saturação. É um ensaio limitado neste computador, não uma garantia de capacidade para qualquer clínica.
- Fluxo geral: dez grupos aprovados após a atualização, incluindo login, cadastros, agenda, financeiro e integridade de exame. Cenários HTTP anteriores de exames mantidos.
- Cópias locais anteriores à atualização: `.data/homolog/pre-1D1-complement.dump` e `.data/homolog/pre-1D1-complement-exams.tar`. Não foram publicadas no Git; este procedimento não substitui o ensaio completo de restauração da etapa 5.
- Não há nova migração de banco. A fila existente `0011_exam_file_deletions` foi preservada. Dados e volumes anteriores mantidos.

Comandos reproduzíveis:

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 -e RUN_CLAMAV_TESTS=1 api python -m unittest discover -s tests -v
./apps/api/.venv/Scripts/python.exe scripts/smoke_exam_operations_homolog.py
./apps/api/.venv/Scripts/python.exe scripts/smoke_exams_homolog.py
./apps/api/.venv/Scripts/python.exe scripts/smoke_exam_gateway_homolog.py
./apps/api/.venv/Scripts/python.exe scripts/smoke_homolog.py
```

Execute o teste do gateway separadamente dos testes de upload: ele ocupa deliberadamente as duas vagas por até 30 segundos. Os dois scripts que usam a API descartável também devem ser sequenciais, pois compartilham a porta 18001.

## Limite do fechamento

As pendências técnicas deste complemento são reconciliação após interrupção, quota, manutenção periódica, concorrência/tempo/proxy e antivírus. Auditoria clínica completa, política de retenção de prontuário, autorização por paciente, HTTPS e backup/restauração assistidos mantêm suas etapas de produto/operação já previstas. Não são funções que um antivírus ou uma rotina de arquivos resolvam.

A validação de formato continua baseada em extensão e marcadores, agora acompanhada da análise do ClamAV; não há garantia de que todo documento esteja semanticamente correto ou seja renderizável. O sistema preserva arquivos originais. Não houve alteração da interface nesta entrega.
