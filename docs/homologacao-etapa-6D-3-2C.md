# 6D.3.2C — migração e recuperação do histórico de pacientes

Início em 09/11/2026, base `7fbdde4`; produto `a296fa9`. Ensaios adiantados durante o CI de B, sem antecipar publicação. Somente scripts de homologação e documentação mudam nesta subetapa.

## Migração e dump — aprovado

Harness `scripts/smoke_clinical_recovery_homolog.py`, log local ignorado `.data/patient-audit-recovery.log`.

- Mantém partida da imagem estável v0.1.24, com verificação do commit. Migra 0025→0026→0027→0028 em bancos privados; snapshot de todas as tabelas antes/depois.
- Rascunho clínico em 0026 e evento administrativo em 0027 são fixtures SQL declaradas, não alegação de escritas autenticadas históricas. Migração 0028 preserva as linhas anteriores e acrescenta somente patient_audit vazia, sem inventar autoria.
- Edição real via API cria evento de paciente, com campo notes e versão correspondente. Leitor clínico sem permissão própria recebe 403.
- Dump customizado e restauração preservam contagens/hashes de todas as tabelas. UPDATE/DELETE/TRUNCATE são recusados nas duas tabelas de auditoria; proteções clínicas mantidas.
- Após novo login, API retorna exatamente os metadados do histórico de pacientes e o cadastro salvo; leitor negado continua negado. Prontuário/adendo/replay/edição de rascunho mantidos, origem intacta.
- Bancos/contêiner/arquivo temporários removidos. Banco, contêineres e volumes principais preservados. Este ensaio não cobre sozinho exames/configuração/TLS.

## Backup operacional completo — aprovado

Harness Windows `scripts/smoke_clinical_full_recovery_homolog.py/.cjs` ampliado para duas edições autenticadas: uma com mudança e outra sem diferença. Verificados API e Chrome restaurados, identificadores/campos/versões, negação ao dentista sem concessão, exames e configuração/TLS, e persistência após reinício.

Usa backup-server.ps1 real, recursos privados e volumes fictícios novos. Não retira ACL nem modifica domínio/contas Windows. Volumes e backup protegidos permanecem retidos conforme contrato do ensaio.

## Fechamento em 10/11/2026

Ensaio operacional concluído: API preservou exatamente os dois eventos (edição e salvamento sem diferença), cadastro e negação ao leitor sem concessão. Chrome restaurado conferiu os dois eventos e seus campos; captura inspecionada. Exames antigos/novos, configuração/TLS, prontuário e edição de rascunho permaneceram funcionais após reinício. Origem intacta; bancos/contêineres privados removidos, volumes fictícios e backup protegido retidos. Sem relaxamento de ACL.

CI final 42670528580 aprovado: 552 frontend, 392 backend, seis imagens sem achados. B/C concluídas; próxima ação: publicar v0.1.30/0028 e conferir avanço Git. Checklist físico permanece obrigatório. Logs locais ignorados: `.data/patient-audit-recovery.log` e `.data/patient-audit-full-recovery.log`. Não representam instalação na clínica.

## Publicação verificada

**Publicação concluída — 10/11/2026:** `piloto-cadastros-v0.1.30` = `d13c7e29bb23de10f763a53e0ac3ee692927be93`, publicada e conferida no remoto. Verificador Git aprovou avanço do checkout limpo v0.1.29; aplicação/imagens/Compose idênticos ao produto `a296fa9` aprovado no CI. Guias alinhados à migração 0028. Instalação assistida de cadastros disponível após checklist físico. Próximo: P3 quando houver dados do servidor; enquanto aguardamos, desenhar o recorte de auditoria de leitura clínica/download antes de implementar. Não repetir 6D.3.2 sem nova falha/mudança. Odontograma posterior. Este fechamento substitui as pendências de publicação abaixo.
