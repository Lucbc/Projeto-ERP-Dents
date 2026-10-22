# U1.14 — correção de musl nas imagens

Concluída em 22/10/2026, base `9dda2c2`; imagens `4815dbb`, harness final `f2f903a`. Versão de instalação: `piloto-cadastros-v0.1.17`.

## Alteração

Fixar musl/musl-utils em 1.2.6-r3 em API, web, gateway, edge, PostgreSQL e ClamAV. Corrige a versão indicada pelo scanner para CVE-2026-107891 (duas ocorrências UNKNOWN por imagem na U1.13). Mantém os digests das imagens-base, código da aplicação, dependências Python/npm, esquema, caminhos e configuração. A imagem intermediária Node de build não é distribuída como runtime e não faz parte dessas seis imagens.

## Aceites concluídos

- Construção das seis imagens aprovada, `.data/musl-build.log`.
- Auditoria das seis imagens aprovada sem achados (`{}` para cada imagem), `.data/musl-audit.log`. Versões musl/musl-utils 1.2.6-r3 conferidas com `apk list --installed` em containers descartáveis sem rede/volumes.
- Fluxo de cadastros Chrome/API/SQL privado aprovado, `.data/musl-registration.log`: CPF, nascimento, RG, permissões, busca, conflito, edição e reabertura. Usa PostgreSQL de homologação existente. A troca da imagem do banco é coberta separadamente pelo ensaio de atualização.
- `smoke_musl_update_homolog.py`: instalação privada v0.1.16 → `f2f903a`, seis imagens substituídas e versões conferidas; backups anterior/posterior restaurados, todas as tabelas preservadas, mesmos volumes/configuração/TLS, sessão/exame e novo login aprovados. Reenvio após reinício retorna o mesmo cadastro. Manutenção **189,19 s** sem construção/download; `.data/musl-update-final.log`, `.data/install_9bb7f9e6591d/result.json`. Primeiro ensaio parou na comparação dos mounts por ordem; ordenar por destino corrigiu o harness, mantendo comparação integral dos valores. Repetição completa aprovada; nenhum volume removido.
- [CI 39788191523](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/39788191523) aprovado: 325 testes backend (583,081 s), 424 frontend, builds, HTTP, auditoria de pacotes e seis imagens sem achados. `.data/musl-ci-final.log`. O commit posterior `f2f903a` altera apenas a comparação de mounts no harness, validado no ensaio completo separado; imagens e aplicação iguais às do CI.

## Instalação e atualização

Instalação nova já constrói todas as imagens. Atualização existente passa a reconstruir/substituir também db/clamav: usuários fora, gateway/API parados, backup verificado, banco/antivírus saudáveis antes da API e recriação dos proxies. Nenhum volume é apagado. Roteiro Windows atualizado com os comandos.

Ensaio usa recursos privados de erp-dents-homolog, configuração/segredos fictícios, imagens previamente construídas e assinaturas de antivírus copiadas do volume de homologação para volume privado. Não equivale à instalação física, teste de capacidade ou reinício do Windows. O backup do harness não substitui a validação do script operacional de backup; testes de navegador são separados do ensaio API/HTTPS.

Guias de instalação/atualização e versão indicada atualizados. Próximo: retomar diagnóstico de resposta perdida na configuração inicial. P3 físico tem prioridade quando chegarem os dados do servidor. Nenhum container principal ou instalação da clínica foi atualizado nesta homologação.
