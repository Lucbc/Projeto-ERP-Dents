# Homologação 3A.3.5.1M — manutenção zlib/Mako

Início em 08/10/2026, base `67fc12d`. Em andamento. Manutenção inserida antes de matrizes administrativas devido aos achados MEDIUM da auditoria da etapa de usuários.

## Escopo e fontes

- Fixar `zlib=1.3.2-r1` nos Dockerfiles de API, web, nginx (gateway/edge), PostgreSQL e ClamAV. Versão confirmada em `apk policy` nos repositórios Alpine v3.24 das imagens; [base oficial de segurança Alpine](https://secdb.alpinelinux.org/v3.24/main.json) associa essa revisão à correção de CVE-2026-85091.
- Lock universal Python atualizado somente de Mako 1.4.1 para 1.4.2 com hashes, usando `uv pip compile --upgrade-package mako==1.4.2` e os argumentos universais existentes. [Release oficial](https://github.com/sqlalchemy/mako/releases/tag/rel_1_4_2) corrige validação de caminhos em Windows; relevante também ao desenvolvimento Windows, embora os containers sejam Linux.
- Bases fixadas por digest, demais pacotes, código da aplicação, migrações, entrypoints e volumes mantidos. API continua não root; PostgreSQL mantém `su-exec` e política de logs. Web/nginx mantêm os mesmos patches de runtime.

## Validação

| Camada | Estado/evidência |
| --- | --- |
| Fonte/pacotes | Disponibilidade de zlib confirmada em containers descartáveis sem volumes, associação CVE no secdb oficial; diff do lock restrito a Mako e dois hashes |
| Backups | `pre-3A-3-5-1M*`: dump público/integral, exames e fingerprints salvos; helper `.data/upgrade_3a351m.py`, retomar somente `after`. Seis imagens anteriores preservadas localmente com tag `pre-3a351m` |
| Builds/auditorias | Seis imagens construídas; npm/Python aprovados. Conferência em containers descartáveis: zlib 1.3.2-r1 nas seis imagens, Mako 1.4.2 na API. Scanner de imagens em execução |
| API/banco/CI | Pendente CI completo com backend/HTTP/frontend, inicialização e migração em ambiente isolado |
| Runtime | Pendente atualização das seis imagens, saúde/antivírus/HTTPS/build servido/smoke/exames/preservação. Não há mudança de interface que exija nova revisão visual |

## Retomada

Concluir builds e auditorias, conferir versões reais, publicar implementação e acompanhar CI. Após aceite: atualizar serviços de `erp-dents-homolog` com os volumes existentes; confirmar saúde e política ClamAV, dez verificações integradas, HTTPS/assets, revisão 0024/zero schemas privados e preservação de linhas/referências/bytes. Logs/backups exclusivamente locais e ignorados. Nenhum volume removido; não repetir `before/full` nem testes aprovados sem mudança/falha.

Próximo após fechamento: **3A.3.5.2 — matrizes administrativas**. R19 permanece parcial; referências gerais em 3A.3.7 e instalação assistida na etapa 5.
