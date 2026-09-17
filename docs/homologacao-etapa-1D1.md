# Homologação 1D.1 — exames

Concluída em 16/09/2026, sobre a base publicada `94a7347`. Ambiente exclusivo `erp-dents-homolog`, com dados fictícios.

**Complemento em 17/09/2026:** as pendências técnicas abaixo de reconciliação, quota, manutenção periódica, concorrência/proxy e antivírus foram implementadas. Consulte [operação de exames](./operacao-exames.md) para o comportamento vigente. Este relatório preserva o registro da entrega inicial.

## Mudanças entregues

- Novos uploads aceitam PDF, JPG e PNG, até 20 MiB (20.971.520 bytes; interface apresenta MB). `EXAM_MAX_BYTES` configura o limite nos três arquivos Compose, entre 1 KiB e 1 GiB. A interface consulta a política do servidor. Outros formatos/tamanhos ainda dependem da necessidade da clínica; arquivos antigos continuam disponíveis para download.
- Extensão e marcadores de assinatura são conferidos; o MIME enviado pelo cliente não é confiado. Não há análise completa da estrutura do arquivo nem antivírus. HTML/SVG não são aceitos em novos uploads.
- Middleware limita o corpo antes do parser multipart, inclusive sem Content-Length: limite do arquivo mais 64 KiB para o formulário. Usa arquivo temporário, com até 1 MiB em memória, e blocos de 64 KiB. O parser pode criar uma segunda cópia temporária; há consumo adicional de disco. O armazenamento verifica espaço livre antes da gravação e remove seus arquivos parciais em falhas tratadas.
- Upload e operações síncronas executam fora do event loop. Interface oferece progresso, timeout de 120 segundos e cancelamento. Cancelar não garante desfazer um envio que o servidor já tenha concluído; a lista é atualizada para conferência.
- Downloads usam attachment, octet-stream, nosniff, CSP sandbox e no-store. A prévia é restrita a PNG/JPG em elemento de imagem; PDF e arquivos legados são baixados. Não há abertura de documentos arbitrários em Blob na origem do ERP.
- Exclusões registram intenção de limpeza em `exam_file_deletions` na mesma transação dos metadados. O arquivo só é removido após confirmação do banco. Falhas de armazenamento mantêm a intenção para nova tentativa. Excluir paciente com consulta vinculada retorna 409, preservando os exames.
- Upload com falha confirmada de banco compensa a gravação física. Se o banco não permite confirmar o resultado da transação, o arquivo é preservado por segurança. Removida a implementação duplicada de armazenamento em `__init__.py`.

## Operação e limites restantes

A fila é processada na inicialização da API (até 100 itens), nas exclusões e pelo comando abaixo (até 1.000 itens por execução). Não há temporizador de limpeza. Repetir o comando caso haja mais itens; ele informa contagens e retorna falha se alguma remoção falhar.

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml exec api python -m scripts.cleanup_exam_files
```

O comando remove somente arquivos com intenção registrada e sem metadados que ainda os referenciem. Não varre órfãos antigos. Uma interrupção abrupta entre gravar um upload e confirmar seus metadados ainda pode deixar órfão; reconciliação, auditoria e retenção continuam pendentes. Alterações diretas por SQL não participam do fluxo de exclusão da API.

Os limites são por arquivo/requisição. Quota global, quantidade de envios simultâneos, limite no proxy e ensaio de carga continuam pendentes. A autorização atual é por perfil/permissão; a política de acesso por paciente permanece na etapa 3. Não considerar esta entrega como liberação para produção.

## Evidências

- **64 testes distintos de backend aprovados:** suíte completa de 62 testes e, após acrescentar duas regressões, os 15 testes de exames novamente aprovados. Incluem rollback, commit ambíguo, corrida com exclusão de paciente, falta de espaço, limite durante streaming, desconexão e recuperação da fila.
- **34 testes de frontend aprovados**, incluindo prévia restrita, MIME forçado, falha de download, limite, progresso e cancelamento: `npm test --prefix apps/web -- --maxWorkers=1`.
- **12 grupos HTTP aprovados** em `scripts/smoke_exams_homolog.py`, com schema/API/arquivos descartáveis. Incluem multipart real, 400/401/403/409/413, bytes e cabeçalhos de download, exclusão e fila vazia. As amostras PDF/JPG verificam marcadores, não um parser completo desses formatos.
- **10 grupos do fluxo geral aprovados** após atualizar o ambiente principal de homologação, preservando os dados fictícios anteriores.
- Build Docker de API/web, TypeScript/Vite e Nginx aprovados. Permanece aviso de bundle web acima de 500 kB.
- Chrome: login existente, política de 20 MB, lista e modal de prévia do PNG fictício anterior conferidos. A amostra tem um pixel; a inspeção não equivale a validar imagens clínicas grandes.
- Migração `0011_exam_file_deletions (head)` aplicada após cópia `.data/homolog/pre-1D1.dump`. A cópia inclui somente banco, não exames, e não comprova restauração completa. Nenhum volume foi removido.

## Situação dos achados e próximo passo

- **R29 parcialmente tratado:** compensação e exclusão transacional com fila; reconciliação após crash, retenção e auditoria pendentes.
- **R30 tratado no fluxo da aplicação:** removida abertura arbitrária de documentos e restringidos novos formatos; sem promessa de detectar todo conteúdo malicioso.
- **R31 parcialmente tratado:** limites, streaming, espaço livre e experiência de envio; quota/proxy/carga pendentes.
- **R33 parcialmente tratado:** armazenamento e segurança têm implementação canônica; outros módulos duplicados ainda precisam de revisão.
- **Próxima entrega: 1D.2 — dependências e builds reproduzíveis.** Conferir versões, lockfiles, compatibilidade e vulnerabilidades com fontes oficiais, em recorte próprio.
