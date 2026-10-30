# 6B.1 — carga e uso simultâneo

## Escopo e estado

Ensaio concluído em 29/10/2026, base de produto `0739c78` (mesmo produto da instalação v0.1.25). Referência informada pela clínica: até 10 pessoas simultâneas e aproximadamente 5.000 pacientes. Não há alteração funcional nesta subetapa.

Implementação: `scripts/measure_concurrent_usage_homolog.py` e `.cjs`. O modo `--quick` verifica o funcionamento do harness; não substitui o ensaio completo. Execução completa aprovada, de 19:24:55 a 19:49:45 UTC, com saída zero e limpeza confirmada. Captura Chrome inspecionada.

## Método reproduzível

1. Com Docker de homologação ativo e imagens atuais, preparar os pré-requisitos dos harnesses Chrome existentes: Node/Playwright/Chrome e certificado local confiável. Definir `PLAYWRIGHT_MODULE` apenas se o módulo não estiver no caminho padrão do Node.
2. Executar `python scripts/measure_concurrent_usage_homolog.py`. Portas privadas utilizadas: 18001 e 18444. Não executar outro harness nessas portas ao mesmo tempo.
3. O script cria schema aleatório e API privados em `erp-dents-homolog`; aplica migrações e cria dez contas fictícias distintas. Não monta volumes de dados nem reinicia serviços principais. Credenciais ficam em memória/arquivo temporário do helper, nunca nos relatórios. O helper remove seu schema/API/arquivo temporário ao encerrar.
4. Cenários sequenciais: 100 pacientes/1 conta; 5.000/1; 5.000/5; 5.000/10. Cada cenário tem aquecimento de 60 segundos e janela de medição de 300 segundos, além do tempo de abertura das referências. Não misturar métricas de aquecimento com as medidas.
5. Na abertura, cada operador percorre páginas de 200 pacientes e referências de dentistas/procedimentos, como a agenda atual. No uso sustentado, a cada 15 segundos lê sessão, busca pacientes, agenda, histórico clínico e contexto do paciente. Uma gravação cadastral por minuto/operador; um autor grava rascunho clínico. Uma saída/entrada do autor por janela exercita operações de sessão junto às leituras. Esse conjunto composto é um roteiro sintético; não replica exatamente todas as chamadas paralelas de uma única tela.
6. Depois das janelas, dez criações concorrentes; disputa de dez edições da mesma versão; disputa de dez criações com mesmo CPF. Conferir por API/SQL contagens, versões e vencedores. Essas disputas são um teste de pico separado, não entram nos percentis do uso sustentado.
7. Amostra de um Chrome com nove operadores HTTP ativos: buscar paciente fora da primeira página, selecionar paciente no formulário da agenda e ler dez evoluções, sem permissão de edição clínica. Conferir versões/recibos de todas as gravações e hashes dos pacientes/consultas/usuários do schema público original.

## Massa e medições

- Base de 100/5.000 pacientes sintéticos, com aproximadamente 570 caracteres de histórico por paciente; 310 consultas (300 distribuídas em 30 semanas e dez consultas clínicas futuras), um dentista e dez evoluções. Cadastros adicionados nas disputas elevam o total final a 5.011 antes da amostra Chrome.
- As 300 consultas adicionais são inseridas por SQL como fixture; não representam aceite de criação pela API. A massa testa principalmente cardinalidade de pacientes, não anos de prontuários/exames de uma clínica madura.
- HTTP direto à API privada em loopback, sem gateway de produção; Chrome usa proxy TLS privado e a imagem web atual. Recursos compartilhados com Docker Desktop e os serviços de homologação existentes. O resultado não certifica o desempenho do futuro servidor ou da rede física.
- Relatório local `.data/homolog/last-concurrent-usage-metrics.json`: imagens, revisão, recursos Docker, p50/p95/máximo por operação, códigos HTTP, bytes de resposta, amostras de CPU/memória/conexões/esperas. Os tempos de ação completa de referências são separados dos tempos por requisição; não somar os dois como quantidade de HTTP.
- Amostragem de recursos aproximadamente a cada sete segundos (coleta `docker stats` e consultas mais espera de cinco segundos). Conexões/esperas gerais incluem a base compartilhada; esperas de relação privada são identificadas separadamente. A ausência de espera numa amostra não prova ausência de contenção entre amostras.
- Arquivos locais: `.data/concurrent-usage-full.log`, `.data/homolog/last-concurrent-usage.json`, `.data/homolog/last-concurrent-usage-browser.json`, `.data/homolog/concurrent-usage.png`. Nenhum contém credenciais; captura e registros são exclusivamente fictícios e não são publicados no Git.

## Resultados completos

Docker Desktop 29.8.0, 12 CPUs lógicas disponíveis, 7,63 GiB de memória disponível à VM. API `sha256:7e625e2ffe0cb38eb39353a06bf77e95014714dfe2804e479236075ca01bc27e`; web `sha256:e3ccc6bc4155019f140e8a86131d2d32d86c9a25d64f8aa76079f90f3c614f94`. O servidor físico da clínica ainda não foi medido.

Todos os tempos abaixo são em milissegundos. P95 significa que 95% das amostras ficaram nesse tempo ou abaixo. As aberturas foram medidas uma vez por operador em cada janela; por isso mostramos o máximo, não uma promessa de tempo típico.

| Pacientes / operadores | Busca P95 | Agenda P95 | Histórico clínico P95 | Salvar cadastro P95 | Abertura completa de referências, máximo |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100 / 1 | 47 | 62 | 62 | 47 | 94 |
| 5.000 / 1 | 62 | 109 | 125 | 47 | 1.265 |
| 5.000 / 5 | 110 | 140 | 218 | 63 | 5.359 |
| 5.000 / 10 | 125 | 141 | 328 | 78 | 5.047 |

- **HTTP:** 2.333 requisições medidas, todas com status 200, excluindo aquecimento, preparação, disputas e navegador. Na janela de dez operadores: 200 buscas, 200 leituras de agenda, 200 leituras clínicas e 50 salvamentos cadastrais. Cinco salvamentos clínicos tiveram máximo de 172 ms; saída/entrada do autor também passaram. Não houve timeout ou resposta inesperada.
- **Abertura de referências:** com 5.000 pacientes, 25 páginas e aproximadamente 5,48 MB de respostas cadastrais por operador, antes da renderização. As diferenças entre cinco/dez operadores e o teste curto demonstram variação do ambiente: o ensaio curto atingiu 8,67 s, enquanto a janela completa atingiu 5,05 s com dez operadores. Não interpretar uma única abertura como capacidade linear ou tempo garantido.
- **SQL/API:** dez criações simultâneas produziram dez IDs distintos; edição da mesma versão produziu um sucesso/nove conflitos; CPF repetido produziu uma criação/nove conflitos. Contagem final 5.011 pacientes; versões de todas as gravações e recibos clínicos conferidos, dez evoluções mantidas. Administração sem concessão clínica e tentativa de escrita pela recepção continuaram negadas.
- **Chrome com outros nove operadores ativos:** busca de paciente fora da primeira página em 207 ms; abrir formulário e selecionar esse paciente em 1.746 ms; abrir/levar ao conteúdo clínico em 222 ms. São amostras únicas de percurso, não percentis nem dez navegadores simultâneos. Históricos visíveis, sem ação de edição clínica para a conta leitora.
- **Recursos:** 53/53/55/55 amostras por cenário. No cenário de dez operadores, API teve pico amostrado de 118,71% de CPU na convenção Docker (pode exceder 100% por haver vários núcleos) e memória final de 75,35 MiB; PostgreSQL, pico de 41,68% e memória final de 138,4 MiB. Máximo de 13 conexões na base compartilhada. Nenhuma espera de relação privada apareceu nas amostras; a coleta esparsa não exclui esperas curtas. Não foi demonstrada necessidade de aumentar pool/workers ou alterar bloqueios clínicos.
- **Preservação:** hashes das tabelas públicas originais de pacientes, consultas e usuários permaneceram iguais. Helper confirmou fechamento do bootstrap após reinício da API privada, removeu somente API/web/schema/arquivos temporários; containers principais seguem com o tempo de atividade anterior e volumes preservados.

## Decisão e próxima subetapa

**6B.1 concluída como diagnóstico de carga**, com integridade e percurso amostral aprovados no cenário descrito. Não certifica jornada inteira de trabalho, rede física, massa clínica densa ou capacidade máxima. O produto e os procedimentos de instalação permanecem v0.1.25; não há nova tag. Somente harness/documentação alterados, portanto a regressão funcional anterior continua válida e não foi repetida integralmente no CI.

**Prioridade 6B.2: reduzir a carga da seleção de pacientes na agenda**, carregando resultados limitados por busca no servidor, em vez de buscar todos os cadastros completos. O custo de abertura foi demonstrado e é maior que os tempos das operações usuais. Manter proteção clínica transacional enquanto não houver evidência que justifique alterá-la.

Aceites da correção: alcançar paciente fora da primeira página e homônimos, preservar seleção atual ao editar, sinalizar indisponível, respeitar permissão revogada, cancelar respostas antigas e preservar rascunho. Reduzir simplesmente a lista aos primeiros 100/200 pacientes impediria selecionar outros cadastros e não é uma correção aceitável. Conferir API/SQL/componentes/Chrome e comparar a abertura com esta referência; publicar nova instalação somente após regressão e aceites. Depois seguir 6C, usabilidade/perfil financeiro restrito. P3 físico continua prioritário quando chegarem os dados do servidor.
