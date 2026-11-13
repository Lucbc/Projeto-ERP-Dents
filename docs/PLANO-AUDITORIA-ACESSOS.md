# 6D.3.3 — auditoria de consultas clínicas e preparação de downloads

**B.3.2 concluída — 13/11/2026:** produto `08df9ab`; [CI 43435196341](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/43435196341) aprovado: 567 testes frontend, 414 backend (632,535 s), fluxos HTTP e seis imagens sem achados. Migração 0031 e leitura clínica em lote aprovadas, incluindo capacidade com dez clientes, preservação de dados, revogação concorrente e Chrome/cadastros. [Relatório](./homologacao-etapa-6D-3-3B-otimizacao.md). **Próximo C:** ampliar os roteiros de recuperação para 0028→0031, dump/restauração e backup operacional Windows com auditoria de acessos, exames/configuração/TLS, permissões e Chrome restaurado; somente depois atualizar guias e publicar tag. Não repetir B sem mudança/falha. Sem nova versão instalável nesta etapa; v0.1.30 ainda exige pacote com patches, não instalar main parcial. P3 físico prioritário se os dados do servidor chegarem. Este fechamento substitui as pendências de CI anteriores.

**B.3.1 concluída — 12/11/2026:** diagnóstico HTTP/SQL/Chrome com 5.000 pacientes, 192.000 eventos, dez clientes e três lotes por configuração. 1.140 requisições medidas, 60 cadastros e 360 eventos clínicos corretos; hash das evoluções preservado; atualização periódica confirmada em Chrome/SQL. [Resultados e limites](./homologacao-etapa-6D-3-3B-capacidade.md). Candidatos eliminam varreduras, mas leitura clínica individual por evolução ainda mantém custo sob bloqueio. **Próximo B.3.2:** migração aditiva de índices e leitura clínica em lote, com preservação/revogação concorrente, repetição de capacidade e CI; depois recuperação C e tag. Nenhuma mudança de produto/instalação nesta medição; capacidade global ainda não concluída. Não repetir diagnóstico sem mudança; aproveitar roteiro e métricas registrados.

**6D.3.3B.2 concluída — 12/11/2026:** produto `90e8074`; [CI 43271932148](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/43271932148) aprovado: 567 testes frontend, 411 backend (954,060 s), fluxos HTTP e seis imagens sem achados. Tela, filtros/paginação, cache e permissões aprovados em componentes e Chrome/API/SQL; regressão de cadastros e revisão visual desktop/celular aprovadas. [Relatório](./homologacao-etapa-6D-3-3B.md). **Próximo B.3: capacidade/índices com até dez clientes fictícios, volume acumulado e atualização automática clínica; depois C, migração 0028→0030 e recuperação completa antes de tag.** Não repetir B.2 sem nova mudança/falha. Sem alteração de roteiro de instalação nesta etapa; tag v0.1.30 ainda não inclui os patches de segurança já registrados. Não instalar main parcial; preparar pacote corrigido isolado se P3 físico for antecipado. Este fechamento substitui as pendências de CI anteriores.

**6D.3.3B.1 concluída — 12/11/2026:** produto `97001e6`; [CI 43219031029](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/43219031029) aprovado: 557 frontend, 411 backend (795,292 s), HTTP e seis imagens sem achados. Consulta paginada/filtrada, permissão própria, revogação concorrente e matriz Chrome/API/SQL aprovadas. Correção krb5-libs/libxslt validada também em builds/scanner/banco privado e cadastros. [Relatório](./homologacao-etapa-6D-3-3B.md). **Próximo B.2:** tela Histórico de acessos com filtros/paginação/estados/cache, semântica de consulta autorizada/download preparado e aceite Chrome. Depois capacidade e recuperação completa antes de tag. Não repetir B.1 sem mudança/falha. Tag v0.1.30 ainda não inclui os patches; instalação física exige pacote corrigido, isolado sobre a tag se antecipada. Não instalar main parcial. Este fechamento substitui as pendências de CI abaixo.


**6D.3.3A concluída — 10/11/2026:** consultas clínicas (A.1) e preparação de downloads (A.2) aprovadas. Produto `faca0e0`; [CI final 42875524681](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/42875524681) concluído com sucesso: 552 testes frontend, 406 backend (828,274 s), fluxos HTTP e seis imagens sem achados. Aceites locais PostgreSQL/ASGI/HTTP, scanner real e regressões documentados no [relatório](./homologacao-etapa-6D-3-3A.md). **Próximo 6D.3.3B.1:** API de consulta paginada/filtrada e permissão própria `access_audit.view`, com revalidação de sessão/concessão e matriz frontend; depois B.2 tela/Chrome, capacidade e C recuperação completa antes de tag. Não repetir A sem mudança/falha. Instalação segue v0.1.30/0028; main contém 0029/0030 em desenvolvimento, sem liberação parcial. P3 físico prioritário; odontograma posterior. Este fechamento substitui as pendências de CI abaixo.


Diagnóstico e desenho em 10/11/2026, base `ba621a1`. **Inspeção estática, sem implementação nem novos aceites de API, banco ou interface.** Instalação `piloto-cadastros-v0.1.30` preservada. P3 físico tem prioridade quando chegarem os dados do servidor; odontograma permanece posterior.

## Evidências no código

| Caminho | Comportamento observado | Consequência para a implementação |
|---|---|---|
| [Leitura clínica](../apps/api/src/adapters/db/repositories/clinical_record_repository.py): `get`, `get_for_appointment`, `list_for_patient` | Revalida ator/sessão/concessão sob bloqueio administrativo; carrega conteúdo e adendos, sem evento de consulta | Persistir metadados antes de devolver o resultado; manter revalidação e não incluir texto/contexto |
| [Bloqueio administrativo](../apps/api/src/adapters/db/repositories/user_repository.py): `administration_lock` | Executa rollback ao sair; as escritas atuais fazem commit explicitamente dentro do bloco | Inserir sem commit perderia o evento; testar falha de commit e liberação do bloqueio |
| [Atualização automática](../apps/web/src/hooks/use-live-query.ts) e [histórico clínico](../apps/web/src/pages/clinical-records/clinical-records-page.tsx) | Nova consulta a cada 15 s enquanto habilitado, visível e online; foco/reconexão também podem consultar | Evento representa requisição autorizada, nunca número de leituras humanas |
| [Editor clínico](../apps/web/src/pages/clinical-records/clinical-editor.tsx) | Consulta registro ao abrir/conferir e depois de escritas | Preservar recibos de escrita; não confundir replay com um novo atendimento |
| [Download](../apps/api/src/api/routers/exams_router.py) | Autoriza na dependência, materializa exame, encerra transação, abre arquivo e passa o mesmo descritor pelo antivírus | Revalidar identidade/concessão após o scanner, antes de preparar a resposta; não segurar bloqueio durante scanner/transmissão |
| [Resposta de arquivo](../apps/api/src/api/exam_response.py) | Suporta Range/If-Range, fecha descritor ao terminar/desconectar; não reabre caminho | Evento anterior à resposta não comprova início ou conclusão da transmissão; preservar protocolo e fechamento |
| [Testes de download](../apps/api/tests/test_exam_download.py) | Cobrem remoção do caminho, ranges, desconexão, envio/leitura falhos, scanner e fechamento | Ampliar a cobertura existente, sem trocar o streaming por carregamento integral em memória |

O download já exige permissão. A nova conferência após o scanner reduz a janela entre autorização e resposta; o diagnóstico não reproduziu acesso indevido. Dados cadastrais como alergias/histórico também aparecem por rotas de pacientes: este recorte não é auditoria de toda exposição de informação clínica.

## Semântica da primeira entrega

1. **Consulta clínica autorizada:** conteúdo foi materializado e o evento foi confirmado no banco antes de retornar ao router. Não comprova serialização HTTP, entrega ao navegador nem leitura humana. Cada chamada autorizada gera seu próprio evento, inclusive atualização automática; não deduplicar silenciosamente.
2. Separar ações de consulta por ID, consulta por agendamento e página por paciente. Página vazia e agendamento sem evolução continuam sendo consultas autorizadas, com quantidade zero. Registro por ID inexistente/validação recusada/401/403 não gera evento de conteúdo disponibilizado. Não alterar a semântica atual dos retornos vazios.
3. **Download preparado:** exame localizado, descritor aberto e aprovado pelo scanner, conta/sessão/permissão novamente conferidas, resposta construída e evento confirmado antes de entregar a resposta ao framework. Não significa download iniciado ou concluído. Uma requisição Range inválida pode posteriormente resultar em 416; o evento continua significando preparação, não entrega de bytes.
4. Não criar eventos de conclusão/abortamento nesta primeira entrega. Instrumentação posterior do transporte exigirá contrato próprio, incluindo queda do processo e falha do banco após envio; nunca apresentar ausência de conclusão como prova de abortamento.
5. Falha ao persistir o evento impede devolver o conteúdo ou iniciar a resposta de arquivo. Retornar erro tratado, sem conteúdo sensível; fechar o descritor em todos os caminhos. O operador poderá tentar novamente. Se o commit tiver resultado desconhecido, pode existir evento mesmo sem resposta recebida — coerente com a semântica acima.

## Dados mínimos e persistência

- Tabela própria `access_audit`, aditiva após 0028; identificador UUID, instante do banco, ator UUID, ação enumerada e alvo UUID tipado (registro, agendamento, paciente ou exame).
- Para respostas clínicas, guardar somente IDs e versões dos registros retornados, quantidade e paginação usada. Lista limitada pelo máximo atual de 100 registros. Para consulta direta, resolver paciente/agendamento a partir do registro carregado, sem confiar em identificação enviada como autoria pelo cliente.
- Para download, guardar ID do paciente/exame; não guardar nome/caminho do arquivo, observações, bytes, cabeçalhos ou parâmetros brutos. Sem texto clínico, contexto, CPF, nomes, e-mail, IP, token ou identificador de sessão. Sessão serve para autorizar, não para compor o evento.
- Validar formato por ação no banco e aplicação, índices por ator e paciente com instante/ID; preservar IDs após exclusões, sem cascata. Bloquear UPDATE/DELETE/TRUNCATE e downgrade destrutivo de tabela preenchida, seguindo o padrão das auditorias anteriores.
- Não criar eventos retroativos. Sem retenção/expurgo automático, exportação ou prazo legal presumido. Medir crescimento: dez telas clínicas abertas por oito horas, com consulta a cada 15 s, produzem aproximadamente **19.200 eventos/dia somente de atualização periódica**, além de foco/editor/download. Isso é estimativa, não ensaio de carga ou tamanho em disco.
- Consultas clínicas: autorizar, materializar, inserir e confirmar dentro do bloqueio atual; não chamar `get` público como auxiliar de escrita para evitar eventos indevidos. Downloads: liberar transação antes do scanner como hoje; depois usar bloqueio curto para revalidar sessão/concessão atual e confirmar evento. Não usar tarefas em segundo plano como único meio de persistência.
- Revogação concluída antes da revalidação bloqueia o acesso. Revogação posterior ao commit não recolhe conteúdo já autorizado nem interrompe transferência em andamento; deixar esse limite explícito.

## Consulta do histórico

Recurso independente `access_audit.view`, somente leitura. Seguir a política das outras auditorias: administrador ativo pode consultar; demais perfis começam negados e dependem de concessão. Isso não concede leitura de prontuários/exames. Não reutilizar `patient_audit.view` nem `clinical_records.view` como autorização implícita.

API paginada por cursor (25 padrão, 100 máximo), ordem instante/ID decrescente, filtros de ação/ator/paciente/alvo e intervalo com fuso. Revalidar sessão/concessão sob bloqueio antes de consultar. Resposta sem cache persistente. Tela traduz ações com as palavras **consulta autorizada** e **download preparado**, explica atualização automática e ausência de prova de leitura/entrega; não mostrar indicadores de “documentos lidos” ou “downloads concluídos”.

401/403 deve ocultar e limpar dados; erro de rede deve ser distinguível de histórico vazio. Filtros de tempo seguem São Paulo. Não registrar leitura da própria auditoria nesta tabela, evitando recursão.

## Subetapas e critérios de aceite

### 6D.3.3A — gravação e regressões (próxima)

- A.1: migração, gravador e três leituras clínicas; testes PostgreSQL privados de sucesso, vazio, autoria, metadados, falha de INSERT/commit, rollback, imutabilidade e preservação. Falha de auditoria não pode devolver conteúdo nem modificar prontuário/recibo.
- A.2: download preparado e revalidação após scanner. Testar revogação/logout/inativação durante scanner, autoria obtida do servidor, 404, scanner indisponível/infectado, erro de persistência e fechamento do descritor. Não segurar bloqueio durante scanner/envio; preservar Range/If-Range, 416, desconexão e remoção do caminho após abertura.
- HTTP autenticado com dados fictícios e SQL: conferir eventos reais das três rotas clínicas e download, recusas sem falso evento de sucesso e ausência de valores proibidos. Respostas de escrita clínica/recibos mantêm o comportamento atual.
- CI e regressões de cadastros. A não conclui a funcionalidade nem autoriza tag parcial; leitura/UI/recuperação continuam necessárias.

### 6D.3.3B — consulta protegida e interface

- PostgreSQL/HTTP: paginação, filtros, limites, sessão/concessão e revogação concorrente. Permissão de auditoria não deve habilitar conteúdo clínico.
- Componentes: matriz de concessões, rotas, filtros, estados, cache e vocabulário. Chrome: administrador, leitor concedido/negado/revogado, paginação, erro/recuperação e atualização automática clínica gerando eventos com a semântica prevista.
- Medir volume e tempo em ensaio controlado de até dez clientes fictícios, sem declarar capacidade de produção a partir de testes unitários. Índices e tamanho da lista de versões devem ser conferidos antes da liberação.

### 6D.3.3C — recuperação e publicação

- Migração a partir de 0028 com cadastros, prontuários e auditorias existentes; comparar todas as linhas e confirmar histórico novo vazio.
- Dump/restauração e backup operacional Windows com exames/configuração/TLS; conferir eventos, proteções, permissões e Chrome restaurado, preservando origem e volumes principais.
- Atualizar guias e tag somente com fluxo completo e CI aprovados. Instalação v0.1.30 permanece disponível enquanto esse trabalho ocorre.

## Resultado de 6D.3.3P

Inventário, semântica, armazenamento, limites e matriz de aceites definidos. Validação documental por confronto com os caminhos e testes citados; nenhum teste integrado executado nesta subetapa e nenhum comportamento alterado. **Próximo: 6D.3.3A.1**, começando pela persistência das consultas clínicas, sem antecipar alteração do streaming ou publicação. R32 geral continua aberto.
