# v0.1.29 — auditoria administrativa e build corrigido

Consolidação em 09/11/2026. Tag: `piloto-cadastros-v0.1.29`.

## Mudanças e permissões

- Registra alterações administrativas de usuários e permissões com autoria, instante, versões e nomes dos campos alterados, sem copiar senhas ou valores pessoais.
- Tela Histórico administrativo com filtros, paginação e acesso por permissão. Administrador ativo pode consultar; demais perfis exigem concessão de leitura. Não permite editar ou excluir eventos.
- Corrige zlib indisponível no build anterior. Cadastros e regras clínicas preservados; odontograma continua posterior.

## Migração e atualização

Partindo da v0.1.28, a API aplica a migração aditiva `0027_administrative_audit`. Preserva as tabelas existentes e não inventa eventos para alterações anteriores. Não exige nova variável, porta ou credencial.

Seguir o [roteiro de atualização](./ATUALIZACAO-SERVIDOR-WINDOWS.md): janela de manutenção, backup completo conferido, API/gateway parados, reconstrução das seis imagens, mesmos projeto/configuração/TLS/volumes. Conferir revisão 0027 e login/cadastros antes de reabrir. Não executar downgrade ou voltar à imagem antiga sobre o banco migrado; preservar estado atual e analisar recuperação com o suporte.

Para instalação nova, seguir o [roteiro Windows](./INSTALACAO-CLINICA-WINDOWS.md). A liberação continua para cadastros após checklist físico, sem habilitação automática do prontuário.

## Evidências e limites

- [CI 42509603594](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/42509603594), produto `73b5b03`: 541 frontend, 380 backend, HTTP e seis imagens sem achados.
- [Aceites separados de componentes, Chrome/API/SQL, cadastros e recuperação](./homologacao-etapa-6D-3-1B.md). Migração 0026→0027 preservou todas as linhas existentes; dump restaurou eventos/proteções.
- Backup operacional real aprovado em 09/11, incluindo configuração/TLS/exames, permissões, Chrome e reinício. Falha Windows anterior não se repetiu; não houve relaxamento de ACL nem reparo de domínio pelo projeto.
- Nenhuma mudança de produto após o CI; scripts de ensaio foram atualizados e executados localmente. Verificador Git de avanço não substitui migração ou aceite físico.
- Outros tipos de auditoria permanecem no [plano](./PLANO-AUDITORIA.md); não representa auditoria geral de todo o ERP.
