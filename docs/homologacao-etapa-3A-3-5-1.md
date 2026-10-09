# Homologação 3A.3.5.1 — usuários

Início em 08/10/2026, base `7af3554`. [Contrato](./plano-etapa-3A-3.md). Concluída em 08/10/2026, sem alteração de API/transações/migração.

## Implementação

- Lista/busca `[users, list, busca]` atualizada pela política 15s/60s, cancelamento, pausa oculto/offline, retorno/manual, última leitura e limite 100/total. Falha inicial não vira lista vazia; falha transitória identifica a última leitura.
- Edição/senha/exclusão mantêm identidade e versão capturadas. Polling não libera revisão nem repõe senha. Fluxo 404 existente encerra ação cujo alvo não existe; conflito exige recarga explícita. Referências de dentistas não recebem polling.
- Fronteira de negação desmonta conteúdo/ações e cancela/remove apenas listas. Recarga tardia não reabre formulário após revogação. Sessão continua sendo encerrada pelo transporte/guard global.
- Teste novo revelou limpeza incompleta dos parâmetros da mutação quando uma rejeição rápida é agrupada pelo React: efeito observava somente `isPending`. Passou a observar também `variables`, limpando senha em memória após conclusão mesmo nesse caso. Testes com valores temporários gerados, sem imprimir credenciais.
- Auditoria encontrou [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) em `source-map-js` 1.2.1, dependência de desenvolvimento PostCSS/Tailwind. Lock atualizado somente para 1.2.2, sem mudar dependências diretas. Auditorias npm/Python passaram após correção; builds finais e CI validaram o lock corrigido.

## Validação

| Camada | Evidência |
| --- | --- |
| Componentes | 13 testes novos: política/falhas/cancelamento/tardias/limites/sinal, isolamento de cache, edição/senha/exclusão/revisão, segredo somente no formulário aberto, revogação e recarga tardia |
| Frontend | Foco inicial 52/53 revelou falha real de limpeza, corrigida; suíte completa 263 testes/32 arquivos em 51,20s aprovada. Primeiro build TypeScript/Vite aprovado em 24,92s; build final após patch de dependência em 10,20s e imagem web aprovados, aviso de bundle existente |
| Segurança | npm/Python aprovados após patch de source-map-js. Imagens sem HIGH/CRITICAL (critério do scanner), porém com achados MEDIUM: zlib 1.3.2-r0 nas seis imagens (CVE-2026-85091; correção indicada 1.3.2-r1) e Mako 1.4.1 na API (CVE-2026-102991; correção indicada 1.4.2). Não declarar imagens sem vulnerabilidades; manutenção separada antes de matrizes |
| Chrome | Harness novo aprovado: sessões independentes, alteração em 13611ms, busca/rascunhos/versões preservados, conflitos reais de edição/senha/exclusão, limpeza de segredo, criação/exclusão/404, falha/recuperação, pausa, revogação de leitura/403 e própria sessão encerrada sem reabrir dados. Quatro escritas explícitas; capturas claro/escuro revisadas. Regressão de versões/senhas/exclusões e troca da própria senha aprovada |
| API/banco/CI | [CI 37795875844](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/37795875844) aprovado: 302 backend/263 frontend, HTTP/builds/auditorias; nenhuma mudança de API/banco |
| Preservação | Backups públicos/exames/fingerprints/dump integral `pre-3A-3-5-1*` salvos; helper `.data/upgrade_3a351.py`, somente `after` na retomada. Comparação antes e após atualização confirmou linhas/referências/bytes de exames preservados, revisão `0024_user_version` e zero schemas `test_%` |

## Retomada

Implementação `de86a06` publicada e CI aprovado. Somente web de `erp-dents-homolog` atualizada; HTTPS confiável retorna 200 e JS/CSS servidos correspondem ao build validado. Dez verificações integradas aprovadas, dados/volumes/backups preservados. Não repetir `before/full`. Logs e capturas locais ignorados: `.data/ci-final-3a351.log`, `.data/smoke-main-3a351.log`, `.data/browser-3a351.log`, `.data/browser-version-3a351.log`, `.data/audit-images-3a351.log` e `.data/homolog/user-refresh-*.png`.

Próximo após aceite: **manutenção 3A.3.5.1M — zlib/Mako nas imagens**, antes de **3A.3.5.2 — matrizes administrativas**. Verificar repositórios oficiais/pacotes corrigidos, atualizar pins/hashes, reconstruir as seis imagens, validar CI/antivírus/HTTPS/backup e preservação, sem remover volumes. R19 parcial; referências gerais em 3A.3.7, instalação assistida na etapa 5. Chrome no mesmo PC não comprova capacidade/estações físicas/outros navegadores.
