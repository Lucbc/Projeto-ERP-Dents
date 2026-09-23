# 2B.6 — exclusões concorrentes de cadastros e agenda

Preparação em 23/09/2026, base `265c2c2`. Este documento define correções futuras; não altera os endpoints nem a política clínica de exclusão. Histórico financeiro da `0021` deve permanecer protegido.

## Mapa atual

Todos os cinco recursos têm versão nas edições, mas DELETE aceita apenas ID. Rotas exigem a permissão `delete` do recurso; casos de uso encaminham apenas ID. `services.ts` também envia somente ID. As telas usam `window.confirm` genérico e a mutação não guarda versão; lista e calendário possuem caminhos próprios para consultas.

| Recurso | Repositório e efeitos atuais | Risco específico |
| --- | --- | --- |
| Pacientes | Bloqueia paciente FOR UPDATE; enfileira limpeza dos exames na transação; consulta restringe exclusão por FK; exames em CASCADE, referência financeira em SET NULL | Bloqueio não compara a versão vista. Exames podem ter mudado sem mudar a versão do paciente; preservar fila, arquivos e rollback |
| Dentistas | `get/delete/commit`; consulta restringe exclusão; usuário e financeiro usam SET NULL | Confirmação antiga apaga edição; vinculação de usuário exige avaliação separada, pois não altera a versão do dentista |
| Procedimentos | `get/delete/commit`; vínculo com consulta restringe exclusão por FK | Edição de preço/nome pode ser apagada por confirmação antiga; IDs financeiros são JSON, com histórico preservado pela `0021` |
| Especialidades | `get/delete/commit`; especialidade de dentista é texto, sem FK para o catálogo | Confirmação antiga apaga renomeação; não assumir que excluir do catálogo altera o texto nos dentistas |
| Consultas | `get/delete/commit`; procedimentos em CASCADE e referência financeira em SET NULL | Edição/reagendamento pode ser apagado; atualizar lista e calendário juntos; não substituir exclusão por cancelamento implicitamente |

Fontes: `apps/api/src/api/routers/*_router.py`, `core/use_cases/*_use_cases.py`, `adapters/db/repositories/*_repository.py`, `models/models.py`; `apps/web/src/lib/services.ts` e páginas de pacientes, dentistas, procedimentos, especialidades, consultas e calendário.

## Reprodução e limites da evidência

Probe local `.data/probe_deletion_2b6.py`, pelo harness `smoke_bootstrap_homolog.py`: API e schema descartáveis, projeto `erp-dents-homolog`, dados fictícios. Para cada recurso, criar versão 1, confirmar PUT que retorna versão 2 e tentar DELETE com `?version=1`. O código atual ignora esse parâmetro. A sequência controlada representa uma confirmação antiga depois de uma edição confirmada; não é teste de simultaneidade por barreira.

**Resultado confirmado nos cinco recursos:** PUT retorna versão 2, DELETE com versão 1 retorna 204 e GET posterior retorna 404. Foram 12 grupos do harness, incluindo cinco diagnósticos e preparação/limpeza. Log local `.data/deletion-2b6-probe.log`. Não adicionar ao CI um teste que exija a permanência desse defeito. Durante implementação, inverter a expectativa para conflito e verificar que o registro editado permaneceu íntegro.

Interface e regras de FK foram inspecionadas no código; esta preparação não constitui homologação de Chrome nem disputa direta de conexões PostgreSQL. Sem migração, reinício da principal ou mudança de dados principais.

Após o probe: zero schemas descartáveis, principal em `0021_financial_references`. Comparação com fingerprints anteriores confirmou colunas de negócio, eventos, recibos, permissões e bytes de exames preservados. Última regressão funcional permanece [CI 35808882862](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35808882862), 197 backend/63 frontend; não repetida para alterações somente documentais.

## Contrato comum de exclusão por versão

1. DELETE exige query `version` inteira positiva, sem fallback. Ausente/zero/negativa/inválida retorna 422; ausência do registro retorna 404; versão desatualizada retorna 409 com `stale_version`. Versão atual não ignora vínculos ou permissões existentes.
2. Comparação e exclusão devem pertencer à mesma operação transacional: DELETE condicionado por ID/versão, ou bloqueio da linha seguido da comparação antes de qualquer efeito. Não fazer GET/checagem fora da transação e DELETE incondicional depois.
3. Corrida PUT × DELETE com a mesma versão tem no máximo uma mutação vencedora. Edição vencedora impede exclusão antiga; exclusão vencedora faz a edição falhar sem recriar o registro. Dois DELETEs produzem uma exclusão e resposta de ausência para o outro, sem sucesso fictício nem efeitos repetidos.
4. FK/restrição continua sendo a barreira contra vínculo criado entre validação e escrita. Conflito de vínculo não deve ser apresentado como versão antiga. Falhas revertem exclusão, efeitos associados e fila; nunca remover bytes antes do commit.
5. Permissões reavaliadas por requisição. Versão não substitui autorização; não liberar `view`/`update`/`delete` adicional para fazer a tela funcionar.
6. Confirmação identifica o registro e guarda o ID/versão exibidos. Atualização de cache não pode trocar silenciosamente a versão já confirmada. Em conflito, recarregar explicitamente e pedir nova confirmação; não repetir automaticamente com a versão mais recente.
7. Após falha de rede/5xx, orientar conferência da lista antes de nova exclusão. Não inventar recibo idempotente para DELETE; 404 numa conferência prova ausência atual, não autoria da exclusão. Não mostrar sucesso quando o resultado for desconhecido.
8. Atualizar rotas, portas, casos de uso, repositórios, serviços web, telas, testes e smokes do recurso na mesma entrega. Clientes antigos sem versão passam a receber 422; recarregar abas após atualizar API/web juntos.

## Vínculos: limite da versão do cadastro

A versão da linha não registra automaticamente criação/alteração de filhos nem de referências externas. Não afirmar que ela protege uma confirmação de todos os efeitos da exclusão.

- Procedimentos: FK de consultas impede perda desse vínculo; referências financeiras já possuem captura e o formulário filtra IDs apagados. Preservar essas garantias.
- Especialidades: nenhuma propagação de exclusão/renomeação ao texto livre dos dentistas nesta etapa.
- Pacientes: antes de implementar, definir como invalidar uma confirmação quando exames/vínculos mudarem (versão agregada ou precondição própria dos efeitos, testada sob bloqueio). Não usar somente contagem de exames: substituição com a mesma contagem também muda o conteúdo. Manter ordem de bloqueios compatível com upload/exclusão/manutenção e fila persistente da 1D.
- Dentistas: mapear vinculação/desvinculação de usuários e criação de consultas antes de escolher a precondição dos efeitos; não alterar a política de SET NULL silenciosamente.
- Consultas: mapear geração/baixa financeira simultânea e seus efeitos. Histórico fica preservado, mas isso não equivale a autorização clínica para apagar consulta já atendida. Não ampliar a regra de negócio nesta correção técnica.

## Sequência

### 2B.6.1 — procedimentos e especialidades

Primeiro recorte de implementação. Ambos têm edição versionada, confirmação simples e não removem arquivos. Aplicar o contrato comum de ponta a ponta; preservar FK de procedimentos e especialidade textual. Não precisa de nova coluna/migração de versão. Começar pelos testes de DELETE antigo e PUT × DELETE em schemas isolados.

### Recortes posteriores

Depois de 2B.6.1, preparar exclusão de consultas em lista/calendário e dentistas, explicitando vínculos. Pacientes/exames exigem contrato próprio antes de qualquer mudança destrutiva. Não agrupar os cinco recursos em uma alteração parcial com proteção desigual. Numeração final dessas implementações será registrada no ponto de retomada de cada entrega.

## Aceite da 2B.6.1

| Camada | Verificação |
| --- | --- |
| PostgreSQL/repositório | PUT × DELETE, DELETE × DELETE, rollback por FK, procedimento vinculado depois da leitura; nenhum perdedor altera dados |
| API | Versão obrigatória/positiva, 404, `stale_version`, conflito de vínculo distinto; permissões negadas e válidas; especialidade textual preservada |
| Financeiro | Exclusão permitida de procedimento mantém origem/pagamentos/recibos; edição de pendente não ressuscita ID apagado |
| Componente | Confirmação conserva ID/versão, erro conserva contexto, recarga exige nova confirmação, falha de rede não vira sucesso |
| Chrome | Duas abas: editar em uma e excluir pela outra; ambos os catálogos; vínculo de consulta impede exclusão; capturas fictícias e limpeza |
| Entrega | Cópias antes da atualização, regressão apropriada, HTTP/builds/CI, preservação, relatório, commit/push e HEAD remoto conferido |

Fora deste recorte: usuários/exames como endpoints independentes, exclusão em massa, auditoria geral, datas, resumos financeiros, parcelas e mudança de política clínica. A instalação assistida permanece na etapa 5.
