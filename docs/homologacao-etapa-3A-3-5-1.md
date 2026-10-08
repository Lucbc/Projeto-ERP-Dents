# Homologação 3A.3.5.1 — usuários

Início em 08/10/2026, base `7af3554`. [Contrato](./plano-etapa-3A-3.md). Em andamento, sem alteração de API/transações/migração.

## Implementação

- Lista/busca `[users, list, busca]` atualizada pela política 15s/60s, cancelamento, pausa oculto/offline, retorno/manual, última leitura e limite 100/total. Falha inicial não vira lista vazia; falha transitória identifica a última leitura.
- Edição/senha/exclusão mantêm identidade e versão capturadas. Polling não libera revisão nem repõe senha. Fluxo 404 existente encerra ação cujo alvo não existe; conflito exige recarga explícita. Referências de dentistas não recebem polling.
- Fronteira de negação desmonta conteúdo/ações e cancela/remove apenas listas. Recarga tardia não reabre formulário após revogação. Sessão continua sendo encerrada pelo transporte/guard global.
- Teste novo revelou limpeza incompleta dos parâmetros da mutação quando uma rejeição rápida é agrupada pelo React: efeito observava somente `isPending`. Passou a observar também `variables`, limpando senha em memória após conclusão mesmo nesse caso. Testes com valores temporários gerados, sem imprimir credenciais.
- Auditoria encontrou [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) em `source-map-js` 1.2.1, dependência de desenvolvimento PostCSS/Tailwind. Lock atualizado somente para 1.2.2, sem mudar dependências diretas. Auditorias npm/Python passaram após correção; builds finais/CI validarão o lock corrigido.

## Validação

| Camada | Evidência |
| --- | --- |
| Componentes | 13 testes novos: política/falhas/cancelamento/tardias/limites/sinal, isolamento de cache, edição/senha/exclusão/revisão, segredo somente no formulário aberto, revogação e recarga tardia |
| Frontend | Foco inicial 52/53 revelou falha real de limpeza, corrigida; suíte completa 263 testes/32 arquivos em 51,20s aprovada. Primeiro build TypeScript/Vite aprovado em 24,92s; reconstrução após patch de dependência em execução |
| Segurança | npm/Python aprovados após patch de source-map-js; imagens pendentes |
| Chrome | Pendente novo harness e regressão de versões/senhas/exclusões |
| API/banco/CI | Pendente CI completo; nenhuma mudança de API/banco |
| Preservação | Backups públicos/exames/fingerprints/dump integral `pre-3A-3-5-1*` salvos; helper `.data/upgrade_3a351.py`, somente `after` na retomada. Principal ainda não atualizada |

## Retomada

Concluir build final/imagem, publicar implementação e acompanhar CI; Chrome privado novo e regressão de usuários sequencialmente, auditoria de imagens. Depois somente web principal/HTTPS/build servido/dez verificações integradas/preservação/zero schemas privados/fechamento/publicação. Não repetir backups `before/full`; dados exclusivamente fictícios em `erp-dents-homolog`, logs/capturas ignorados. Nenhum volume removido.

Próximo após aceite: **3A.3.5.2 — matrizes administrativas**. R19 parcial; referências gerais em 3A.3.7, instalação assistida na etapa 5. Chrome no mesmo PC não comprova capacidade/estações físicas/outros navegadores.
