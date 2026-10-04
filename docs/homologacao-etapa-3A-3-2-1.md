# Homologação 3A.3.2.1 — lista e resumo financeiro

Início em 03/10/2026, base `cb9e8fc`. [Contrato](./plano-etapa-3A-3.md). Em andamento; sem alteração de regra financeira, transação, API ou migração.

## Implementação

- Lista e resumo usam a política compartilhada de leitura 15s/60s, visibilidade/conexão/retorno e atualização manual. Cada seção tem estado/timestamp próprio. Sinal de cancelamento chega ao Axios nos dois serviços; filtro anterior não repõe dados no atual.
- Resumo continua por intervalo de **vencimento**, sem busca/tipo/status/paciente/dentista; escopo explicado na tela. Carregamento/falha inicial não produz saldo zero. Falha transitória preserva última leitura identificada; seções podem refletir instantes diferentes.
- Lista mostra quantidade exibida/total e limite de 200; orienta refinar quando truncada. Não foi implementada paginação completa. Filtros recebem nomes acessíveis; opção Pago não depende mais de edição aberta/permissão de escrita (inconsistência preexistente no filtro, sem alterar opções de gravação).
- Leitura de lista ou resumo com 401/403 desmonta todo o conteúdo financeiro, descarta formulários e cancela/limpa o cache financeiro, inclusive histórico. 401 real continua sob transporte da sessão. Permissões efetivas/guard externo continuam aplicáveis. Falha transitória não desmonta ações.
- Polling não modifica estado capturado de edição, geração, baixa/estorno ou identidade de tentativa. Referências de formulário não recebem polling. Atualização periódica do histórico é recorte 3A.3.2.2; atualização das referências fica em recorte próprio.

## Validação local

| Camada | Evidência |
| --- | --- |
| Componentes/serviços | 16 testes novos: atualização independente, erro inicial sem zero/vazio falso, dados antigos identificados/60s/manual, filtros/datas/cancelamento/resposta tardia, pausa/retorno/requisição lenta, rascunho/versão, geração/baixa incertas e mesma chave, permissão de leitura/filtro Pago, revogação/cancelamento/cache, sinal HTTP |
| Regressão frontend | **194 testes/27 arquivos aprovados em 86,35s**; inclui fluxos versionados e idempotentes existentes |
| Build | TypeScript/Vite e imagem web aprovados; aviso de bundle existente permanece |
| API/banco | Sem alteração; aguardam regressões CI e smoke após atualização |
| Chrome | Aprovado: dois perfis/sessões, alteração remota em 14738ms, 12 GETs de lista/9 de resumo no cenário completo; filtros/rascunho/versão mantidos, edição/baixa antigas 409 reais, falhas independentes/recuperação, criação/exclusão, pausa oculta17s, revogação e 403 real. Duas escritas explícitas, nenhuma automática. Capturas claro/escuro inspecionadas e legíveis |
| Auditorias/preservação local | npm/Python e seis imagens sem achados; linhas de negócio/referências históricas/bytes de exames preservados após limpeza privada |
| Publicação/CI/atualização | Pendentes |

Primeiro foco: 20/23 aprovados. Três falhas do novo teste: seletor textual Pago também encontrou opção do filtro; fixture 409 não incluía código `stale_version` necessário à mensagem de revisão. Corrigidos harness/fixture; novo foco e suíte completa aprovados. Não contar tentativa inicial como aceite.

Cópias públicas/exames/fingerprints/dump integral `pre-3A-3-2-1*` salvos em `.data/homolog`; helper `.data/upgrade_3a321.py`. Zero schemas privados antes do dump. Backups não devem ser sobrescritos. Logs/capturas locais ignorados, dados exclusivamente fictícios em `erp-dents-homolog`, nenhum volume removido.

## Retomada

Publicar implementação, aguardar CI completo e executar regressão Chrome do histórico financeiro existente após ativar polling da lista. Depois atualizar somente web, verificar HTTPS/build servido/smoke e preservação; fechar 3A.3.2.1. Próximo recorte é 3A.3.2.2 (histórico e ações abertas). Não declarar R19 concluído nem repetir testes aprovados sem mudança/falha. Sessões no mesmo PC não demonstram capacidade ou estações físicas.
