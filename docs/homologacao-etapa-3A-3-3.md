# Homologação 3A.3.3 — pacientes

Início em 04/10/2026, base `a0cc938`. [Contrato](./plano-etapa-3A-3.md). Em andamento; sem alteração de API, transação ou migração.

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
| API/banco/CI | Pendente CI completo e smoke após atualização; código de API/banco não alterado |
| Preservação | Cópias públicas/exames/fingerprints/dump integral `pre-3A-3-3*` salvos; helper `.data/upgrade_3a33.py`. Após limpeza privada, linhas/referências/bytes preservados, revisão 0024/zero schemas; falta atualização principal |

## Retomada

Implementação `1d4160d` publicada; **CI `37207143061` em execução**, frontend/auditoria inicial aprovados, backend/HTTP em andamento. Validações locais concluídas, sem processo privado pendente. Aguardar CI; depois atualizar somente web principal, verificar HTTPS/build servido, smoke e preservação (`after` do helper; não repetir `before/full` nem sobrescrever backups). Fictícios apenas em `erp-dents-homolog`; logs/capturas ignorados, nenhum volume removido.

Somente após aceite iniciar 3A.3.4.1, procedimentos/especialidades, conforme contrato. Exames/referências gerais têm recortes próprios; R19 parcial. Navegador no mesmo PC não demonstra capacidade/estações físicas.
