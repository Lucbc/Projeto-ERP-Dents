# 6D.3.3C — recuperação da auditoria de acessos

Início em 13/11/2026, base `279bb54`; produto `08df9ab` aprovado no CI 43435196341. Mudanças restritas aos roteiros de homologação e documentação. Sem alteração de aplicação/imagens nesta etapa.

## Migração e dump — aprovado

- Roteiro `smoke_clinical_recovery_homolog.py` preserva os aceites históricos desde a imagem v0.1.24/0025, conferindo o commit da imagem; agora fixa a passagem por 0028 antes de migrar à 0031.
- Fixtures SQL explicitamente históricas: rascunho, evento administrativo e edição de paciente/versionamento. A passagem 0028→0031 preservou contagens/hashes de todas as tabelas existentes, acrescentou `access_audit` vazia e os três índices de consulta. Não inventou acessos retroativos.
- API autenticada gerou as três ações clínicas com ator/paciente corretos; leitor sem permissão específica recebeu 403. Nenhum arquivo é coberto por este ensaio de banco; download é conferido no operacional.
- Dump customizado/restauração preservaram todas as tabelas por contagem/hash. Índices presentes; UPDATE/DELETE/TRUNCATE recusados para auditoria de acessos, mantendo também as proteções anteriores.
- Após autenticação na cópia restaurada, API devolveu os mesmos eventos, IDs, instantes, versões e permissões. Prontuários, adendos, recibos, edição de rascunho e cadastros preservados. Origem inalterada.
- Bancos/contêiner/arquivo temporários removidos, banco e volumes principais preservados. Log local ignorado `.data/access-audit-recovery.log`.

## Backup operacional — aprovado

Roteiro `smoke_clinical_full_recovery_homolog.py/.cjs` ampliado para quatro ações reais (três consultas clínicas e download preparado), preservação exata dos eventos, índices e proteções na cópia restaurada. Chrome conferiu leitor negado, administrador, eventos anteriores e filtro por exame com vocabulário de preparação, sem afirmar entrega de bytes.

Usa `backup-server.ps1` real no Windows, bancos/contêineres/volumes fictícios exclusivos. Mantém ACL e configuração/TLS protegidos. Não há remoção de volumes principais, alteração de domínio ou contorno de permissões. Logs/backup locais são ignorados pelo Git.

## Próximo passo

Concluir e registrar o ensaio operacional/Chrome/reinício. Só então preparar publicação da tag corrigida e alinhar guias de instalação/atualização à revisão 0031. Instalação física continua dependente do checklist do servidor e rede da clínica.

## Fechamento — 13/11/2026

Backup Windows real aprovado: manifesto, hashes, configuração/TLS e exames íntegros. Todas as tabelas restauradas com contagens/hashes idênticos; quatro ações e metadados preservados, três índices presentes e proteções UPDATE/DELETE/TRUNCATE ativas. Administrador consulta; dentista sem concessão continua negado. Conteúdo clínico/recibos e exames antigos/novos conferidos por HTTPS.

Chrome restaurado confirmou os eventos anteriores pelos IDs, negação ao dentista, filtro por exame e texto de download preparado; captura `.data/homolog/access-audit-full-recovery.png` inspecionada. Prontuário/adendo/contexto e edição do rascunho aprovados. Reinício preservou edição, exames e eventos antigos, e permitiu gravar novos acessos. Origem intacta.

Bancos/contêineres privados removidos; volumes fictícios e backup protegido retidos pelo contrato do ensaio. Nenhum volume principal removido nem ACL relaxada. Log ignorado `.data/access-audit-full-recovery.log`. Aplicação/imagens/Compose idênticos ao produto `08df9ab` aprovado no CI 43435196341 (567 frontend, 414 backend, seis imagens sem achados); não é necessário repetir esse CI por mudanças apenas nos roteiros executados localmente e documentação.

C concluída. Próximo: publicar v0.1.31 com guias alinhados à revisão 0031 e verificar avanço Git da v0.1.30. O ensaio não substitui o checklist físico da clínica.
