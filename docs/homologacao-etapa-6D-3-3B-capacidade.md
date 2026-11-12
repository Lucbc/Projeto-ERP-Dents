# 6D.3.3B.3.1 — capacidade e diagnóstico de consultas

Ensaio em 12/11/2026, base `a0a3f4e`. **Diagnóstico concluído; otimização B.3.2 e recuperação C continuam pendentes.** Nenhuma mudança de aplicação, imagem, migração ou tag. Índices candidatos existiram apenas no esquema descartável.

## Método e limites

- Projeto exclusivo `erp-dents-homolog`, API/esquema privados; dados fictícios. Docker disponibilizava 12 CPUs lógicas e aproximadamente 7,63 GiB de memória. Não é o servidor da clínica.
- 5.000 pacientes, 100 evoluções de um paciente e 192.000 eventos históricos inseridos por SQL. O histórico sintético contém 75% de consultas com 20 pares ID/versão e 25% de downloads preparados, distribuídos entre atores/pacientes. Não representa eventos reais retroativos.
- 192.000 é o volume estimado de dez dias com dez telas abertas oito horas/dia atualizando a cada 15 segundos. Os timestamps da massa são compactados artificialmente; isso não simula dez dias de operação contínua.
- Dez contas/sessões distintas, dez trabalhadores HTTP simultâneos, três lotes por configuração. Cada lote faz 190 requisições: 60 consultas clínicas (alternando 20/100 evoluções), 60 consultas de auditoria (geral/alvo), 60 buscas de pacientes e dez criações de pacientes. Carga em rajada sem pausas; não são dez navegadores nem oito horas de uso.
- Configuração atual primeiro; depois os três índices candidatos. Cada consulta SQL tem três amostras EXPLAIN ANALYZE/BUFFERS. Cache aquecido, sem reiniciar banco ou limpar cache do sistema. Não houve alternância aleatória de ordem, isolamento de CPU ou significância estatística.
- Referência diagnóstica de p95 abaixo de dois segundos, não garantia contratual de produção. Uma amostra exploratória inicial ultrapassou esse valor (clínico 2.427 ms e auditoria 2.157 ms com candidatos); as três repetições finais ficaram abaixo. A variação não foi ocultada.

## API e banco — resultados

1.140 requisições medidas responderam com os códigos esperados. Criados 60 pacientes (total final 5.060), persistidos exatamente 360 novos eventos clínicos antes do navegador. Cada lote confirmou 30 eventos com 100 pares ID/versão; arrays/versões preservados. As 100 evoluções mantiveram hash integral após carga e Chrome. Nenhum erro HTTP ou timeout no ensaio aprovado.

Faixa do p95 entre os três lotes, em milissegundos (não é p95 combinado):

| Operação | Configuração atual | Índices candidatos |
|---|---:|---:|
| Consulta clínica (20/100 evoluções) | 1867.01–1941.53 | 1748.19–1856.08 |
| Consulta do histórico | 1745.90–1814.79 | 1511.09–1690.45 |
| Busca de pacientes | 73.43–75.66 | 156.61–190.87 |
| Criação de paciente | 83.75–135.74 | 211.57–250.98 |

Os cadastros permaneceram funcionais e rápidos nesta massa. A diferença entre configurações não é atribuível apenas aos índices: há variação de execução e memória/cache, inclusive piora de latência cadastral na segunda configuração.

Mediana de três execuções SQL isoladas, em milissegundos; não inclui HTTP nem espera pelo bloqueio de autorização:

| Consulta | Atual | Candidatos |
|---|---:|---:|
| all | 77.807 | 0.204 |
| patient | 0.348 | 0.312 |
| author | 0.359 | 0.387 |
| target_miss | 28.787 | 0.424 |
| action | 46.899 | 0.337 |
| time | 54.812 | 0.163 |
| cursor | 47.625 | 0.221 |

As consultas geral, alvo inexistente, ação, período e cursor usavam varredura sequencial/ordenação na configuração atual; os candidatos usaram Index Scan. Paciente e responsável já usavam os índices existentes. Não comparar tempo SQL isolado diretamente ao p95 HTTP.

Tamanho inicial da tabela com índices: 143.73 MiB. Após candidatos: 174.74 MiB, incluindo também os 180 eventos reais da primeira fase. Índices passaram de 41.41 para 72.13 MiB. Isso mede somente `access_audit`, não WAL, backups, exames ou todo o banco; não extrapolar como dimensionamento definitivo. Páginas de 100 evoluções foram exercitadas por HTTP, mas a massa histórica principal usa 20 versões.

## Interface — aceite separado

Chrome real, uma conta concedida, abriu a tela de prontuário e aguardou atualização periódica sem clique, recarga ou foco forçado. Primeira resposta e nova resposta após pelo menos dez segundos verificadas. SQL confirmou 2 eventos novos nessa navegação, todos de consulta clínica. Isso confirma a semântica de requisição autorizada, não leitura humana. Não é um teste de dez interfaces simultâneas.

## Decisão para B.3.2

1. Implementar migração aditiva posterior à 0030 com índices `(occurred_at DESC,id DESC)`, `(target_id,occurred_at DESC,id DESC)` e `(action,occurred_at DESC,id DESC)`. Validar upgrade com tabela preenchida, preservação/imutabilidade, downgrade apenas de índices e custo de migração antes de publicar. Não alterar 0029 já existente.
2. Substituir o carregamento individual da página clínica por leitura em lote dos registros e adendos. Hoje `list_for_patient` consulta IDs e chama `_load` para cada registro; cada `_load` faz SELECT FOR UPDATE e outra consulta de adendos. Uma página de 100 evoluções gera 200 consultas nessa parte, dentro do bloqueio administrativo. É evidência estática de custo; não houve instrumentação de tempo por lock para atribuir toda a latência a ele.
3. Preservar ordenação, conteúdo/adendos/versões, limite, autoria, revalidação de sessão/concessão, atomicidade do evento e revogação concorrente. Não remover o bloqueio de autorização apenas para melhorar números.
4. Repetir este ensaio após as mudanças e executar regressões clínicas/API/Chrome e CI do produto. Só depois fechar capacidade e seguir para C: migração desde 0028, dump/backup operacional e recuperação antes da tag.

## Reprodução e evidências

Executar `python scripts/smoke_access_audit_capacity_homolog.py` com imagens atuais de homologação, Chrome e Playwright disponíveis (`PLAYWRIGHT_MODULE` se necessário). Porta temporária 18001/18444 e TLS de homologação conforme os outros ensaios. O roteiro remove apenas seu contêiner/esquema/arquivos temporários; não remove volumes. Aprovação inclui reinício da API e limpeza confirmada.

Evidências locais ignoradas: `.data/access-capacity.log`, `.data/access-capacity-metrics.json` e amostra exploratória `.data/access-capacity-initial-metrics.json`. Os relatórios contêm métricas agregadas; nenhuma credencial ou conteúdo clínico é publicado.

O script e a documentação foram validados localmente. Sem novo CI completo nesta entrega de diagnóstico: aplicação/imagens permanecem idênticas ao produto `90e8074`, aprovado no CI 43271932148. Isso não constitui aprovação das otimizações futuras. Roteiros de instalação não mudam nesta etapa; a exigência de pacote corrigido e checklist físico permanece.
