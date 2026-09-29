# Homologação 2B.8.3.2 — versões de usuários

## Escopo

Implementação iniciada em 28/09/2026 sobre `2d16abc`, validação local concluída em 29/09/2026. Versão obrigatória nas edições, redefinições administrativas, troca própria de senha e exclusões. Migração `0024_user_version` inicializa cadastros existentes em 1; criação/bootstrap também começam em 1. Login, logout e leituras não incrementam. Edição aceita, inclusive sem diferença, incrementa.

Comparação e escrita ocorrem na mesma transação, depois da revalidação de sessão e autorização. Conflito retorna 409 `stale_version`, sem expor cadastro. Alterações de segurança continuam revogando sessões atomicamente; nome isolado não revoga. Recuperação local lê e consome versão sob bloqueio, sem criar acesso alternativo HTTP.

Interface captura a versão original. Conflito ou resposta incerta exige recarga explícita, preservando somente o rascunho não sensível. Senhas e variáveis das mutations são limpas; troca própria consulta `/auth/me` ao abrir. Exclusão mostra identidade e efeitos, exige nova leitura/confirmação após conflito e não reenvia automaticamente. API e web devem ser atualizados juntos; clientes antigos sem versão recebem 422.

## Evidências locais

| Camada | Resultado |
| --- | --- |
| Banco/casos de uso | Dez testes novos aprovados: versões/limites, no-op, disputas edição/senha/exclusão, senha própria × administrativa, cache antigo, revogação e rollback. Migração ida/volta preserva cadastros, sessões e instalação |
| Regressão focada | Execução inicial de 74 métodos em 272,519s teve cinco métodos antigos com falhas de preparação por colisão de nomes de helpers. Alias corrigido; 16 testes dos dois módulos afetados aprovados em 48,253s. A execução inicial inteira não é contada como aprovada |
| Componentes | Oito testes aprovados em 2,46s: rascunho/versão, recarga falhando, ausência de reenvio, identidade, perda de acesso, limpeza de senha/cache e bloqueio durante envio. Uma expectativa inicial corrigida para o rótulo de envio |
| HTTP | Onze grupos aprovados em API/schema privados; versões enviadas explicitamente, sem helper automático. 422/409, incremento, sessões, exclusão e último administrador |
| Chrome | Duas abas, HTTPS confiável: edição antiga, recarga 503, revisão explícita, senha administrativa antiga, campos limpos ao reabrir, exclusão antiga e confirmação atual, senha própria antiga e saída após sucesso. Aprovado após corrigir separadores de identidade que haviam sido gravados como `?` |
| Visual/build | Builds API/web aprovados. Capturas locais `user-version-light.png`, `user-version-dark.png`, `user-version-delete.png` inspecionadas; avisos e identidade legíveis |

Concorrência é demonstrada por conexões independentes no PostgreSQL. HTTP e Chrome exercitam intercalações controladas; não são testes de carga. Helpers que buscam versão atual existem somente na preparação das regressões antigas; clientes de produção não têm fallback. Os testes novos de versão desativam esses helpers.

## Entrega e preservação

Somente `erp-dents-homolog`, dados fictícios. Cópias públicas/exames/fingerprints `pre-2B8-3-2*` salvas antes da atualização; helper local `.data/upgrade_2b832.py`. A comparação ignora apenas revisão Alembic/coluna nova, mantendo os demais campos e bytes sob verificação sem imprimir conteúdo.

Implementação `4b922ba` publicada e HEAD remoto conferido. Dump integral salvo após zero schemas privados. API/web atualizados juntos em https://localhost:18443, HTTPS 200 e dez verificações gerais aprovados. Revisão `0024_user_version`, usuários originais na versão 1, zero schemas privados. Comparação confirmou cadastros/histórico/bytes preservados; nenhum volume removido.

O [primeiro CI 36569908545](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/36569908545) executou 301 testes backend em 751,576s, com cinco erros em preparação antiga: duas alterações e uma exclusão sem versão, dois cadastros usando ORM atual sobre revisão 0007. Frontend aprovado; HTTP/auditoria de imagens não executaram. Corrigidas as fixtures de `test_auth_hardening` e `test_bootstrap`: versão explícita/helper de preparação e INSERT somente com colunas antigas antes da migração. Nenhuma mudança funcional adicional.

Os cinco casos corrigidos passaram em 27,035s. Ajuste publicado em `ef0a72a`, HEAD remoto conferido. Regressão HTTP local adicional: **31 scripts de HTTP/prontidão aprovados**, incluindo autenticação, permissões, usuários, agenda, financeiro, exclusões, exames e armazenamento. Dados preservados e zero schemas privados confirmados novamente após a suíte.

**Concluída em 29/09/2026.** [CI final 36571964718](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/36571964718) aprovado em 20min17s: **301 backend em 713,449s e 121 frontend**, builds, regressão HTTP, dependências e auditoria das seis imagens. Nenhuma falha pendente desta subetapa. Logs, cópias e credenciais permanecem ignorados pelo Git.

## Continuidade

2B.8 concluída: leituras de permissões sem escrita, coordenação da autorização/sessão e versões de matrizes/usuários entregues. O escopo de sobrescrita e integridade tratado na etapa 2B está concluído, com evidências específicas por recurso. Isso não equivale a atualização automática das telas entre computadores nem auditoria de todas as alterações clínicas.

Próximo passo: preparar a etapa 3, começando pelo diagnóstico focado de atualização entre PCs (R19), preservação dos rascunhos versionados e estados de conexão. Datas, cadastros, permissões de leitura, paginação e interação seguem os demais recortes da etapa 3. Instalação/atalhos, backup e atualização assistida continuam na etapa 5. Não repetir a revisão geral ou testes já aprovados sem nova alteração/falha.
