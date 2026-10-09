# Homologação 3A.3.5.1M — manutenção zlib/Mako

Início em 08/10/2026, base `67fc12d`. Em andamento. Manutenção inserida antes de matrizes administrativas devido aos achados MEDIUM da auditoria da etapa de usuários.

## Escopo e fontes

- Fixar `zlib=1.3.2-r1` nos Dockerfiles de API, web, nginx (gateway/edge), PostgreSQL e ClamAV. Versão confirmada em `apk policy` nos repositórios Alpine v3.24 das imagens; [base oficial de segurança Alpine](https://secdb.alpinelinux.org/v3.24/main.json) associa essa revisão à correção de CVE-2026-85091.
- Lock universal Python atualizado somente de Mako 1.4.1 para 1.4.2 com hashes, usando `uv pip compile --upgrade-package mako==1.4.2` e os argumentos universais existentes. [Release oficial](https://github.com/sqlalchemy/mako/releases/tag/rel_1_4_2) corrige validação de caminhos em Windows; relevante também ao desenvolvimento Windows, embora os containers sejam Linux.
- Bases fixadas por digest, demais pacotes, código da aplicação, migrações, entrypoints e volumes mantidos. API continua não root; PostgreSQL mantém `su-exec` e política de logs. Web/nginx mantêm os mesmos patches de runtime.
- Auditoria após os primeiros builds removeu zlib/Mako, mas revelou HIGH de `tiff` 4.7.1-r0 (CVE-2026-4775) em web/gateway/edge. Incluído pin `tiff=4.7.2-r0` nos dois Dockerfiles nginx; disponibilidade e associação CVE confirmadas no repositório/secdb oficial Alpine v3.24. Reconstruir essas três imagens e auditar novamente; primeiro CI substituído, não contar como aceite.

## Validação

| Camada | Estado/evidência |
| --- | --- |
| Fonte/pacotes | Disponibilidade de zlib confirmada em containers descartáveis sem volumes, associação CVE no secdb oficial; diff do lock restrito a Mako e dois hashes |
| Backups | `pre-3A-3-5-1M*`: dump público/integral, exames e fingerprints salvos; helper `.data/upgrade_3a351m.py`, retomar somente `after`. Seis imagens anteriores preservadas localmente com tag `pre-3a351m` |
| Builds/auditorias | Seis imagens construídas; npm/Python aprovados. Conferência em containers descartáveis: zlib 1.3.2-r1 nas seis imagens, Mako 1.4.2 na API e tiff 4.7.2-r0 nas três nginx. Auditoria final das seis imagens sem achados |
| API/banco/CI | Pendente CI completo com backend/HTTP/frontend, inicialização e migração em ambiente isolado |
| Runtime | Seis serviços atualizados com volumes existentes; IDs das imagens e zlib/Mako/tiff reais confirmados. Mounts idênticos aos anteriores. Banco/ClamAV saudáveis, política de assinaturas e recarga aprovadas; dez verificações integradas e HTTPS/assets aprovados. Linhas/referências/bytes preservados, revisão `0024_user_version`, zero schemas `test_%`. Não há mudança de interface que exija nova revisão visual |

## Retomada

Implementação `cfb6332`/`02c5ada` publicada; CI inicial `37868944488` cancelado/superado, final `37869172013` em execução no backend/HTTP. API privada de exames aprovada (multipart/bytes/ranges/limites/permissões/exclusão), limpeza concluída. Homologação já atualizada e todas as validações locais aprovadas; **retomar somente CI e fechamento documental/publicação**, sem repetir testes. Logs em `.data/{docker,audit-deps,audit-images,exams,update-runtime,smoke-main,clamav}-3a351m*.log`, backups locais ignorados; nenhum volume removido. Helpers `.data/upgrade_3a351m.py` e `.data/runtime_3a351m.py`, somente `after`; não repetir `before/full`.

Próximo após fechamento: **3A.3.5.2 — matrizes administrativas**. R19 permanece parcial; referências gerais em 3A.3.7 e instalação assistida na etapa 5.
