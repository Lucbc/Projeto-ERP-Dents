# Homologação 2B.6.4.2 — exclusão individual e download

**Concluída em 25/09/2026.** Implementação `3dd58ed`, base `b596739`, seguindo o [contrato](./plano-etapa-2B6-4-2.md). [CI 36147540532](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/36147540532) aprovado em **14min23s**, com **247 backend/97 frontend**, HTTP, builds e auditorias.

## Alterações

- Download abre uma vez, verifica esse descritor com ClamAV e transfere por ele. `OpenExamResponse` reaproveita parser/cabeçalhos Range/If-Range da Starlette, substituindo suas rotinas de leitura; nunca reabre o caminho nem usa pathsend. Leituras em blocos, tamanho obtido pelo descritor e encerramento garantido em sucesso/erro/desconexão. Corpo menor que o anunciado falha em vez de terminar normalmente.
- Transação de leitura termina antes do scanner/transferência; não há lock global retido. Ausência na abertura é 404, falha de armazenamento é 507. Scanner permanece obrigatório e falha fechado. Nenhuma migração ou alteração de política de retenção.
- Exclusão usa resultado transacional para 404; repositório mantém ordem paciente → exame, relê sob lock e faz rollback em toda falha/ausência. Fila permanece transacional e limpeza posterior ao commit.
- Interface confirma paciente/arquivo, bloqueia duplicidade, exige recarga explícita e nova confirmação após erro. Arquivo/notas do upload são preservados. Remoção encerra a prévia correspondente e invalida resposta de imagem em voo; mudança de paciente também invalida requisições antigas.

## Evidências

- Primeiros 24 testes focados aprovados em 55,886s: resposta ASGI, exclusão individual e regressão de pacientes/conjunto/financeiro. Após adicionar exclusão/limpeza real durante resposta e tratamento de erro de stat, **12 testes focados finais aprovados em 20,142s**.
- ASGI: remoção após scanner, cabeçalhos ou durante corpo preserva bytes; intervalos únicos/múltiplos, If-Range, 400/416, HEAD, Unicode/anexo/segurança e comprimentos. Desconexão em ASGI 2.0/2.4, envio de cabeçalhos falhando, truncamento e scanner recusando/indisponível fecham descritores. Testes de resposta usam scanner substituído; scanner real é verificado pelo HTTP.
- Banco isolado: cache antigo vira 404 com transação encerrada; falha após enfileiramento faz rollback; duas exclusões resultam em uma remoção e uma ausência, com uma tarefa durável. Durante resposta aberta, outra sessão obtém lock global, exclui metadado e limpa arquivo: resposta termina com bytes originais e descritor fechado.
- **96 frontend aprovados em 46,17s**, incluindo oito novos casos. Primeiro teste de identidade falhou porque refetch ocorreu enquanto consulta inicial ainda estava em voo; corrigida a espera do fixture, sem alterar produto.
- HTTP isolado: **13 grupos aprovados**, incluindo multipart/bytes/Range/If-Range, permissões, DELETE repetido 404, rollback com consulta vinculada e fila/arquivos limpos. Build API/web aprovado; API reconstruída após complemento de tratamento de armazenamento.
- Chrome: primeira execução passou download exato, prévia, disputa/404, rascunho e erro ao baixar; parou na asserção de recarga porque esperava sumir o texto do botão que muda durante carregamento. Corrigido teste para esperar linha removida e recarga concluída; a execução seguinte passou.

- **Chrome final aprovado**: bytes baixados conferidos, prévia, duas abas, DELETE 204/404, falha apresentada no download ausente, recarga e nova confirmação; arquivo/notas do upload preservados. Duas capturas conferidas. Sem falha de produto encontrada nesse teste.

- Complemento final: nove testes de interface aprovados em 5,42s, incluindo revogação com confirmação aberta; oito testes de resposta aprovados em 0,107s, incluindo desconexão antes do corpo. Build final API/web aprovado. Total esperado no CI: 247 backend/97 frontend.
- HTTP operacional aprovado: ClamAV real bloqueia EICAR no upload/download legado; indisponibilidade retorna 503 e conserva metadados/arquivo. Quota concorrente, lock de manutenção, quarentena e restauração também aprovados. Execuções em containers/schemas próprios, sem dados principais.

## Fechamento e preservação

- Regressão local: **247 backend em 675,521s**, todos aprovados. CI final: **247 backend em 502,289s e 97 frontend**, todos aprovados. Auditoria das seis imagens retornou `{}` nessa execução; auditoria de pacotes e builds também aprovados.
- Gateway no CI: 413/503, JSON 408 em 30,007s, vagas de upload liberadas, 80 chamadas de saúde com p95 de 0,0242s.
- Chrome final aprovado em `.data/exam-642-browser-final.log`; capturas de revisão e conclusão conferidas. Testes privados usam dados fictícios e removem seus próprios containers/schemas.
- Cópias públicas/exames/fingerprints e dump completo `pre-2B6-4-2*` salvos localmente; helper `.data/upgrade_2b642.py`. Dump completo somente após zero schemas descartáveis.
- API/web principais atualizados juntos em **https://localhost:18443**. Revisão **0022_dentist_user_restrict** mantida. Dez verificações gerais aprovadas, incluindo download real na versão atualizada. Comparação final confirmou todas as linhas de negócio, histórico e bytes de exames preservados; zero schemas descartáveis e nenhum volume removido. Recarregar abas antigas.
- Implementação `3dd58ed` publicada e HEAD remoto conferido. Fechamento documental posterior ao CI será publicado separadamente; logs, capturas, credenciais e cópias ficam fora do Git. R18 permanece parcial para regras entre recursos.

## Próximo recorte

Preparar **2B.7 — disponibilidade de dentistas × agendamento/reagendamento**: mapear validações e ordem de bloqueios, reproduzir a alteração concorrente de horários e definir contrato antes de implementar. Não reabrir exclusões concluídas. Auditoria clínica completa e instalação assistida mantêm etapas próprias.

## Limites e manutenção

- Corrida de remoção foi validada em Linux dentro do Docker, ambiente de execução previsto. Não foi homologada instalação nativa no Windows. Plataformas que recusam remover arquivo aberto continuam dependendo do retry durável da limpeza.
- Arquivos publicados são imutáveis pelas operações da aplicação. Escrita administrativa direta no mesmo arquivo não faz parte dessa garantia; truncamento é detectado e interrompe o corpo.
- A resposta reaproveita métodos internos da Starlette para manter compatibilidade de Range. Atualizações dessa dependência devem passar pelos testes de protocolo/descritor antes da entrega.
- Downloads HTTP são verificados com ClamAV real. Interrupção/remoção em pontos precisos é validada no ASGI e no banco; no Chrome foram verificados arquivo completo e falha 404, não uma simulação de perda de rede no meio da transferência.
