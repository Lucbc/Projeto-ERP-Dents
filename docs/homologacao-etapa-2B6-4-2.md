# Homologação 2B.6.4.2 — exclusão individual e download

Implementação iniciada em 25/09/2026, base `b596739`, seguindo o [contrato](./plano-etapa-2B6-4-2.md). **Em validação; ainda não concluída.**

## Alterações

- Download abre uma vez, verifica esse descritor com ClamAV e transfere por ele. `OpenExamResponse` reaproveita parser/cabeçalhos Range/If-Range da Starlette, substituindo suas rotinas de leitura; nunca reabre o caminho nem usa pathsend. Leituras em blocos, tamanho obtido pelo descritor e encerramento garantido em sucesso/erro/desconexão. Corpo menor que o anunciado falha em vez de terminar normalmente.
- Transação de leitura termina antes do scanner/transferência; não há lock global retido. Ausência na abertura é 404, falha de armazenamento é 507. Scanner permanece obrigatório e falha fechado. Nenhuma migração ou alteração de política de retenção.
- Exclusão usa resultado transacional para 404; repositório mantém ordem paciente → exame, relê sob lock e faz rollback em toda falha/ausência. Fila permanece transacional e limpeza posterior ao commit.
- Interface confirma paciente/arquivo, bloqueia duplicidade, exige recarga explícita e nova confirmação após erro. Arquivo/notas do upload são preservados. Remoção encerra a prévia correspondente e invalida resposta de imagem em voo; mudança de paciente também invalida requisições antigas.

## Evidências já obtidas

- Primeiros 24 testes focados aprovados em 55,886s: resposta ASGI, exclusão individual e regressão de pacientes/conjunto/financeiro. Após adicionar exclusão/limpeza real durante resposta e tratamento de erro de stat, **12 testes focados finais aprovados em 20,142s**.
- ASGI: remoção após scanner, cabeçalhos ou durante corpo preserva bytes; intervalos únicos/múltiplos, If-Range, 400/416, HEAD, Unicode/anexo/segurança e comprimentos. Desconexão em ASGI 2.0/2.4, envio de cabeçalhos falhando, truncamento e scanner recusando/indisponível fecham descritores. Testes de resposta usam scanner substituído; scanner real é verificado pelo HTTP.
- Banco isolado: cache antigo vira 404 com transação encerrada; falha após enfileiramento faz rollback; duas exclusões resultam em uma remoção e uma ausência, com uma tarefa durável. Durante resposta aberta, outra sessão obtém lock global, exclui metadado e limpa arquivo: resposta termina com bytes originais e descritor fechado.
- **96 frontend aprovados em 46,17s**, incluindo oito novos casos. Primeiro teste de identidade falhou porque refetch ocorreu enquanto consulta inicial ainda estava em voo; corrigida a espera do fixture, sem alterar produto.
- HTTP isolado: **13 grupos aprovados**, incluindo multipart/bytes/Range/If-Range, permissões, DELETE repetido 404, rollback com consulta vinculada e fila/arquivos limpos. Build API/web aprovado; API reconstruída após complemento de tratamento de armazenamento.
- Chrome: primeira execução passou download exato, prévia, disputa/404, rascunho e erro ao baixar; parou na asserção de recarga porque esperava sumir o texto do botão que muda durante carregamento. Corrigido teste para esperar linha removida e recarga concluída; resultado final pendente.

- **Chrome final aprovado**: bytes baixados conferidos, prévia, duas abas, DELETE 204/404, falha apresentada no download ausente, recarga e nova confirmação; arquivo/notas do upload preservados. Duas capturas conferidas. Sem falha de produto encontrada nesse teste.

- Complemento final: nove testes de interface aprovados em 5,42s, incluindo revogação com confirmação aberta; oito testes de resposta aprovados em 0,107s, incluindo desconexão antes do corpo. Build final API/web aprovado. Total esperado no CI: 247 backend/97 frontend. HTTP operacional com ClamAV recusando/indisponível em andamento.

## Pendências de entrega

- Regressão backend completa em `.data/exam-642-full.log`; Chrome final em `.data/exam-642-browser-final.log`. Não declarar aprovação antes do término.
- Cópias públicas/exames/fingerprints `pre-2B6-4-2*` salvas localmente; helper `.data/upgrade_2b642.py`. Principal ainda não atualizada. Após zero schemas, salvar dump completo, atualizar API/web juntos, executar smoke e comparar dados/bytes.
- Publicar implementação, acompanhar CI e fechar plano/R18. Logs, capturas, credenciais e cópias permanecem fora do Git. R18 continua parcial para regras entre recursos.
