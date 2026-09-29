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

**Pendente neste registro:** CI completo, dump integral após limpeza dos schemas privados, atualização conjunta API/web, smoke/preservação e fechamento documental. Nenhum volume deve ser removido. Logs, cópias e credenciais permanecem ignorados pelo Git.
