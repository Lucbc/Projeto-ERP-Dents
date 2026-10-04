# Homologação 3A.3.2.1 — lista e resumo financeiro

Início em 03/10/2026, base `cb9e8fc`; concluída em 04/10/2026, implementação `22a29ff`. [Contrato](./plano-etapa-3A-3.md). Sem alteração de regra financeira, transação, API ou migração.

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
| API/banco | CI: 302 testes backend em 730,192s e regressões HTTP aprovados. Após atualização: dez verificações integradas, dados de negócio/histórico/bytes de exames preservados; revisão `0024_user_version`, zero schemas privados |
| Chrome | Aprovado: dois perfis/sessões, alteração remota em 14738ms, 12 GETs de lista/9 de resumo no cenário completo; filtros/rascunho/versão mantidos, edição/baixa antigas 409 reais, falhas independentes/recuperação, criação/exclusão, pausa oculta17s, revogação e 403 real. Duas escritas explícitas, nenhuma automática. Capturas claro/escuro inspecionadas e legíveis |
| Auditorias/preservação local | npm/Python e seis imagens sem achados; linhas de negócio/referências históricas/bytes de exames preservados após limpeza privada |
| Publicação/CI/atualização | Implementação `22a29ff` publicada; CI `37167240927` aprovado em 21min (302 backend/194 frontend, builds, pacotes/seis imagens sem achados). Somente web principal atualizada; HTTPS confiável 200, assets JS/CSS idênticos ao build validado |
| Regressão Chrome histórica | Aprovada após polling: respostas perdidas de baixa/estorno recuperam um evento, rascunho antigo rejeitado, correção/nova baixa e tentativas atrasadas preservam histórico |

Primeiro foco: 20/23 aprovados. Três falhas do novo teste: seletor textual Pago também encontrou opção do filtro; fixture 409 não incluía código `stale_version` necessário à mensagem de revisão. Corrigidos harness/fixture; novo foco e suíte completa aprovados. Não contar tentativa inicial como aceite.

Cópias públicas/exames/fingerprints/dump integral `pre-3A-3-2-1*` salvos em `.data/homolog`; helper `.data/upgrade_3a321.py`. Zero schemas privados antes do dump. Backups não devem ser sobrescritos. Logs/capturas locais ignorados, dados exclusivamente fictícios em `erp-dents-homolog`, nenhum volume removido.

## Retomada

Aceite concluído. [CI aprovado](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/37167240927), logs locais `.data/ci-final-3a321.log` e `.data/smoke-main-3a321.log`; comparação de preservação repetida após atualização e limpeza das fixtures. Backups intactos; nenhum volume removido. Verificação HTTPS não substitui ensaio de interface: Chrome foi homologado em schema privado antes da atualização principal.

Próximo recorte é 3A.3.2.2 (histórico e ações abertas): atualizar histórico sem trocar versão, pagamento ou chave de tentativa capturados; tratar 404/403 sem expor histórico antigo e preservar revisão explícita de conflitos/resultados incertos. Não declarar R19 concluído nem repetir testes aprovados sem mudança/falha. Sessões no mesmo PC não demonstram capacidade ou estações físicas; outros navegadores não foram ensaiados. Instalação assistida continua na etapa 5.
