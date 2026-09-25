# 2B.6.4.2 — exclusão individual e download de exames

Preparação concluída em 25/09/2026, base `52a08ae`. Complementa o [contrato de pacientes/exames](./plano-etapa-2B6-4.md). **Defeitos reproduzidos; correção funcional pendente.** A 2B.6.4.1 permanece concluída.

## Diagnóstico reproduzido

Probe local `.data/probe_exam_download_2b642.py`, em container descartável da imagem `erp-dents-homolog-api`, somente na rede `erp-dents-homolog_default`, sem volumes, portas publicadas ou conexão com banco. PNG fictício em diretório temporário; segredo efêmero em memória, não exibido. Usado **ClamAV real da homologação**.

O probe substitui a obtenção dos metadados por um objeto fictício e chama `download_exam`, seguida da resposta ASGI real, sob `ServerErrorMiddleware`. Remove o caminho deterministicamente nos pontos abaixo. Não é chamada HTTP autenticada nem teste de disputa no banco/worker.

| Ponto de remoção | Resultado observado |
| --- | --- |
| Após obter o caminho, antes de abrir para o scanner | `FileNotFoundError`; resposta 500; scanner não executa |
| Depois do scanner, antes de executar `FileResponse` | Scanner aprovado; `RuntimeError` no stat; resposta 500 |
| Ao enviar cabeçalhos, antes da abertura por `FileResponse` | Scanner aprovado; cabeçalho 200 já enviado; `FileNotFoundError`, nenhum byte do arquivo enviado |

O terceiro caso demonstra transferência interrompida depois de anunciar sucesso. Não prova que o navegador salva arquivo vazio: o comportamento do cliente ainda precisa de teste.

### Viabilidade da solução

Três verificações abriram o arquivo uma única vez e removeram o caminho antes do scanner, depois do scanner ou entre duas leituras. Nos três casos o scanner real aprovou, reposicionou a leitura no início, **todos os bytes** coincidiram com o original e o descritor foi fechado pelo contexto.

Isso comprova o comportamento do sistema de arquivos Linux do container, não uma resposta de streaming pronta, cancelamento HTTP ou execução nativa no Windows. Onde não for possível remover um arquivo aberto, a fila deve manter a tarefa para repetir após o fechamento, sem marcar limpeza como concluída.

Sétimo diagnóstico, somente no caso de uso com repositório substituído: `get != None` e `delete == False`; `ExamUseCases.delete` terminou sem erro. Confirma resultado transacional ignorado, não uma disputa real em PostgreSQL. Inspeção adicional: repositório retorna ausência sem rollback explícito e protege com rollback somente o commit, não a operação inteira.

## Decisões para implementar

### Download pelo mesmo descritor

1. Manter autenticação/permissão. Buscar metadados e abrir antes da resposta. Ausência na abertura vira erro de domínio 404; falha de armazenamento usa resposta controlada existente, sem expor caminhos.
2. Scanner verifica **o descritor que será enviado**. Recusa/indisponibilidade fecha o arquivo sem iniciar download. Não confiar apenas na verificação feita no upload.
3. Transferir em blocos limitados; obter tamanho pelo descritor. Nunca reabrir o caminho ou fazer stat nele após a abertura. Arquivos publicados são imutáveis nas operações suportadas; alteração administrativa direta não está coberta.
4. Resposta assume a posse do descritor e fecha em sucesso, falha de construção, erro ao enviar cabeçalhos, leitura e cancelamento/desconexão. `BackgroundTask` isolado não basta após erro. Verificar fechamento mesmo sem começar a iteração do corpo.
5. Não segurar lock global de armazenamento nem de linha durante transferência lenta. Encerrar a transação de leitura após materializar metadados, sem commit acidental de escrita. Exclusão/limpeza podem prosseguir enquanto o download já aberto termina.
6. Preservar octet-stream, nome do anexo, nosniff, CSP e no-store. `Content-Length` deve corresponder aos bytes enviados; erro posterior ao início interrompe a transferência, nunca conclui normalmente um corpo incompleto.
7. **Preservar Range/If-Range**, incluindo intervalo único/múltiplo, inválido e fora do tamanho. A implementação instalada de `FileResponse` oferece esses comportamentos; substituição direta por `StreamingResponse` os perderia. Não anunciar suporte sem implementá-lo. Intervalos também usam o descritor já verificado. Testar nome com acentos.

Inspeção da Starlette instalada confirmou stat antes dos cabeçalhos e reabertura nas rotinas de corpo/intervalos de `FileResponse`. `StreamingResponse` possui caminhos distintos de desconexão conforme a versão ASGI; ambos precisam de teste. Escolher helper/classe sem copiar desnecessariamente o framework.

### Exclusão individual e interface

- UUID identifica arquivo imutável: não acrescentar versão fictícia ou migração. Caso de uso deve usar o booleano transacional: falso significa 404, mesmo após leitura anterior positiva.
- Manter ordem paciente → exame e fila na mesma transação; reler sob bloqueio sem cache ORM antigo. Rollback cobre operação inteira, inclusive enfileiramento e saída por ausência. Nenhuma remoção física antes do commit.
- Confirmação mostra paciente e nome do arquivo salvo, usa o ID escolhido e bloqueia duplicidade. Se identidade do paciente não carregou, impedir confirmação. Não reutilizar hook de catálogos passando versão inventada.
- Erros 404/403/503, rede e 5xx exigem recarga explícita e nova confirmação. Recarga falha mantém bloqueio; refetch automático não autoriza reenvio. Reavaliar permissão/existência após recarga.
- Preservar arquivo e notas do formulário de upload. Vincular prévia local ao ID; remover/revogar a imagem excluída e invalidar sua requisição em voo. Navegação para outro paciente/desmontagem também invalidam requisições antigas.
- Sucesso invalida lista/conjunto utilizados pela confirmação de exclusão do paciente. Aba com exame já excluído recebe 404, revisa lista e permite nova escolha somente depois.

## Aceite da próxima entrega

| Camada | Evidência necessária |
| --- | --- |
| Banco | Duas exclusões e exame × paciente em conexões distintas; ausência transacional, rollback/fila, cache antigo e bytes preservados antes do commit |
| Download | Remoção antes/depois de abrir e durante envio; bytes, cabeçalhos, Range, scanner recusando/indisponível, falhas de leitura/envio, desconexão e descritores liberados |
| Componentes | Identidade, clique duplo, erro/recarga falha/sucesso/nova confirmação, permissão, formulário preservado, prévia atual/em voo revogadas |
| HTTP isolado | Autenticação/permissões, 404/503, scanner real, bytes/cabeçalhos, exclusão e retry da limpeza no harness próprio |
| Chrome HTTPS isolado | Duas abas, exclusão do mesmo exame, revisão/nova confirmação, prévia/rascunho, download concluído e falha sem falso sucesso |
| Entrega | Regressão/CI, cópias, API/web juntos, preservação de dados/arquivos, zero schemas descartáveis, commit/push e HEAD remoto igual |

Implementar 2B.6.4.2 a partir daqui, sem repetir revisão geral ou adicionar teste permanente que espere o defeito antigo. Concluir esses critérios antes de avançar para regras entre recursos.

## Ambiente e limites desta preparação

- Principal em **https://localhost:18443**, revisão `0022_dentist_user_restrict`, sem reconstrução, migração, reinício ou remoção de volumes.
- Comparação com checkpoint da 2B.6.4.1 confirmou linhas de negócio, histórico e bytes dos exames preservados; zero schemas `test_%`. Fingerprint exclui sessões/tentativas de autenticação.
- Sete diagnósticos controlados, com cinco verificações reais do scanner. **Sem nova homologação de HTTP autenticado, banco concorrente ou interface.** Fechamento de descritor verificado somente no contexto de arquivo do probe, não em cancelamento de streaming.
- Último CI funcional permanece [36046114839](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/36046114839), da implementação anterior: 235 backend/88 frontend. Não repetido para mudança exclusivamente documental. R18 continua parcial.
- Probe/credenciais locais fora do Git. Pontos de injeção e resultados registrados acima permitem reproduzir em outro computador sem copiar dados de homologação.
