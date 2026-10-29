# 4C.1 — atualização e recuperação do banco clínico

## Escopo

Ensaio técnico em 29/10/2026, base `39d445f`, exclusivamente com dados fictícios em `erp-dents-homolog`. Esta subetapa verifica banco e API. Não libera uma nova versão de instalação e não substitui o aceite do backup completo com arquivos de exames e navegador restaurado (4C.2).

## Procedimento

1. Construir imagem separada da API a partir da instalação `piloto-cadastros-v0.1.24`, commit `aedbde07ee72f1740994026feaf449b464d9510c`, em checkout limpo. Nenhum container principal é atualizado.
2. Criar dois bancos privados, com nomes aleatórios, no PostgreSQL de homologação. Subir a imagem antiga apenas no primeiro, confirmar migração 0025 e cadastrar administrador, paciente com contexto clínico legado, especialidade, dentista, procedimento, usuário dentista, duas consultas e lançamento financeiro, todos fictícios.
3. Parar somente a API temporária. Calcular quantidade/hash das linhas de todas as tabelas públicas. Executar a migração 0026 com a imagem atual e comparar cada tabela anterior, exceto a identificação da migração. Confirmar que apenas as três tabelas clínicas foram acrescentadas.
4. Abrir a API atual sobre esse banco. Confirmar leituras cadastrais/financeiras e negação clínica inicial em todos os perfis, inclusive administrador. Conceder acesso explícito ao dentista e criar um rascunho separado e uma evolução finalizada com adendo.
5. Parar a API temporária, produzir `pg_dump` em formato custom e restaurar com `pg_restore --exit-on-error` no segundo banco. Comparar todas as tabelas, incluindo autoria, contexto, versões, permissões, sessões e recibos.
6. Conferir que os gatilhos restaurados rejeitam alteração direta do texto finalizado e exclusão de adendos/recibos. Abrir a API no banco restaurado, fazer novo login, ler ambos os registros e repetir a tentativa do adendo com a mesma chave/corpo. Os hashes das três tabelas clínicas devem permanecer iguais após a repetição.
7. Confirmar rejeição da edição do original finalizado e salvar uma nova versão do rascunho restaurado. Conferir que o banco de origem não foi alterado.
8. Remover somente os dois bancos privados, container temporário e dump temporário. Conferir preservação da base principal. Nenhum volume é criado, montado ou removido por este ensaio.

## Evidências e limites

Harness: `scripts/smoke_clinical_recovery_homolog.py`. Resultados em `.data/clinical-recovery.log` e `.data/homolog/last-clinical-recovery.json`, fora do Git. Segredos são efêmeros, transmitidos por ambiente do processo filho e mantidos fora de argumentos/logs/relatórios. O dump existe somente temporariamente no container do PostgreSQL.

**Aceite local aprovado:** migração, preservação de todas as tabelas anteriores, permissões iniciais, gravações clínicas, dump/restauração integral das linhas, gatilhos PostgreSQL, leitura/repetição/edição pela API restaurada e preservação da origem/base principal. A execução final do harness passou, incluindo os gatilhos. Não há aceite de interface nesta subetapa.

**Limites:** a comparação cobre todas as tabelas, mas apenas os módulos listados acima receberam registros representativos; a tabela de exames permanece sem arquivos neste ensaio. Não foram exercitados `backup-server.ps1`, integridade do manifesto, cópia do volume de exames, configuração/TLS restaurados nem navegador. Esses são os próximos aceites em 4C.2. Os testes completos do produto continuam os do CI `40799671459`, código `587f994`; esta subetapa acrescenta somente harness/documentação, sem mudança do produto.

## Reprodução técnica

Pré-requisitos: homologação ativa, porta 18001 livre, Python no computador de desenvolvimento, imagem atual `erp-dents-homolog-api` e imagem `erp-dents-homolog-pilot-v24` construída do checkout limpo do commit indicado, com label `erp.test.source=aedbde07ee72f1740994026feaf449b464d9510c`. O script verifica o projeto/volume do banco e a label da imagem antiga antes de criar recursos. A label identifica a preparação; não substitui conferir o checkout antes do build.

Executar `python scripts/smoke_clinical_recovery_homolog.py`. Não executar em paralelo com outros harnesses que ocupem a porta 18001. Esse comando é de homologação para desenvolvimento, não uma instrução de instalação da clínica.

## Próximo

4C.2: preparar origem isolada com exame fictício e dados clínicos, produzir backup operacional completo e restaurar banco/arquivos/configuração em destinos novos. Validar hashes e API, depois login e leitura pelo Chrome. Somente após o aceite completo avaliar a versão de instalação e atualizar os guias. Até lá, instalação continua v0.1.24 para cadastros.
