# Homologação 3A.3.3 — pacientes

Início e conclusão em 04/10/2026, base `a0cc938`; implementação `1d4160d`. [Contrato](./plano-etapa-3A-3.md). Sem alteração de API, transação ou migração.

## Implementação

- Lista/busca usam política compartilhada 15s/60s, cancelamento HTTP, pausa oculto/offline, retorno e atualização manual. Erro inicial não vira vazio; falha transitória mantém última leitura identificada pelo estado/timestamp. Limite 100/total informado, sem paginação completa.
- Busca e rascunho/versionamento permanecem independentes da lista. Ausência em consulta filtrada/limitada não prova exclusão; não descarta edição aberta. Resposta 404/409 ao salvar mantém rascunho e bloqueia novo envio até recarga/revisão explícita; tentativa de recarga que falha também conserva rascunho.
- Prévia/versão/fingerprint de exames da exclusão não recebem polling. Atualização da lista não renova confirmação nem libera a revisão após erro. Servidor continua validando versão e conjunto de exames; nova prévia somente após ação explícita. Prévia 403 por falta de permissão de excluir exames não implica perda de leitura de pacientes.
- 401/403 na **lista** desmontam conteúdo, rascunhos e confirmação; cancelam/limpam caches de pacientes, paciente e exames. Guard de permissões compartilhadas continua aplicável. Não há escrita automática nem polling novo da tela de exames/referências.

## Validação

| Camada | Evidência |
| --- | --- |
| Componentes | 10 testes novos: atualização/busca/limite, rascunho/versão/404/409/revisão, prévia/fingerprint imutáveis e revisão não liberada por polling, falha/60s/manual, busca cancelada/resposta tardia, pausa/retorno/sem sobreposição, 401/403 sem dados/ações/caches |
| Frontend | Foco 18 testes aprovado; suíte **218 testes/29 arquivos em 37,00s** aprovada. TypeScript/Vite aprovados em 20,36s; aviso de bundle existente |
| Segurança | npm/Python e seis imagens sem achados; imagem web construída |
| Chrome | Novo harness aprovado: sessões independentes, edição remota em **14734ms**, busca/rascunho/versão/prévia preservados, edição/exclusão antigas 409 e edição de excluído 404 reais; criação/exclusão refletidas, falha/recuperação, pausa oculta, revogação/403. Três escritas explícitas, nenhuma automática; capturas claro/escuro inspecionadas |
| Regressão de exclusão | Aprovada: edição concorrente, upload após prévia vazia e troca de exame com mesma contagem rejeitados; aguarda 17s após mudanças de exames para provar que polling não renova fingerprint. Permissão insuficiente não abre confirmação; concessão/nova revisão permite exclusão |
| API/banco/CI | CI `37207143061` aprovado, job em 18min12s: **302 backend em 616,489s/218 frontend**, HTTP/builds/auditorias. Após atualização, dez verificações integradas aprovadas; revisão `0024_user_version`, zero schemas privados |
| Preservação/atualização | Somente web principal atualizada; HTTPS confiável 200, assets JS/CSS iguais ao build validado. Linhas de negócio/referências históricas/bytes de exames preservados após smoke. Cópias públicas/exames/fingerprints/dump integral `pre-3A-3-3*` intactos; helper `.data/upgrade_3a33.py` |

## Retomada

**Aceite concluído**, [CI aprovado](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/37207143061). Logs locais `.data/ci-final-3a33.log`, `.data/browser-3a33.log`, `.data/browser-deletion-3a33.log` e `.data/smoke-main-3a33.log`. Nenhum teste pendente ou alteração funcional posterior ao commit do CI. Fictícios apenas em `erp-dents-homolog`; logs/capturas ignorados, nenhum volume removido. HTTPS verifica o build servido; interface validada no Chrome em schema privado antes da atualização principal.

**Próximo: 3A.3.4.1, procedimentos/especialidades**, conforme contrato: listas/limites, versões/edições preservadas, exclusão/inativação e falha/retorno, sem modificar duração/fim digitados na agenda. Exames/referências gerais têm recortes próprios; R19 parcial. Chrome no mesmo PC não demonstra capacidade/estações físicas/outros navegadores. Instalação assistida continua na etapa 5.
