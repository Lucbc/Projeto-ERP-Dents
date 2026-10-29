# 4B.1 — leitura do prontuário e contexto do paciente

## Escopo

Concluída em 28/10/2026, base `8ecc799`, código `530f778`. Leitura aprovada localmente e no CI. A escrita pela interface permanece em 4B.2. A versão de instalação continua `piloto-cadastros-v0.1.24`, sem migração clínica.

## Mudanças

- Rota `/patients/:patientId/clinical-records` com permissão `clinical_records.view`, sem restringir o perfil. Corrigido o bypass de administrador no `ProtectedRoute` apenas para esse recurso; o componente também verifica a permissão antes de carregar conteúdo.
- Acesso pela lista de pacientes e pelo detalhe do paciente em Consulta, visível apenas com leitura clínica. A tela Consulta continua com seu escopo de dentista.
- Contexto atual do cadastro destacado em Consulta: alergias e histórico médico. Valores vazios são apresentados como não informados, sem afirmar ausência de alergias.
- Leitor mostra autor, datas de registro/atualização/finalização, rascunho ou texto finalizado, contexto capturado na finalização e adendos separados com autor/data/motivo. Textos são renderizados como texto, sem interpretar HTML.
- Paginação de dez registros; troca de página não mantém o texto da página anterior sob um novo número. Troca de paciente e recarga reiniciam a página.
- Leitura cadastral permanece independente: a rota não consulta nome/data de nascimento/contexto atual se `patients.view` estiver negado. Nesse caso, informa a limitação e mantém apenas evoluções/contexto já capturado, permitidos pelo recurso clínico. A descoberta pela lista exige acesso à lista; não foi criado um catálogo clínico alternativo de pacientes.
- Consultas clínicas usam cache vinculado a usuário/paciente/página, sem retenção após desmontagem. Perda de acesso oculta conteúdo, cancela leituras e remove dados privados do cache. Nenhuma operação de escrita clínica foi adicionada ao frontend nesta entrega.

## Validação

| Camada | Evidência |
| --- | --- |
| Componentes focados | 34 testes aprovados em leitor/consulta/integração de permissões; incluem 9 casos novos de leitura, contexto separado, admin, paginação, HTML como texto, HTTP 401/403 e revogação |
| Frontend integral | 508 testes em 51 arquivos aprovados; TypeScript/build e imagem web aprovados; aviso já conhecido de tamanho do bundle permanece |
| Chrome + API | Leitor de recepção abre pela lista, percorre 11 registros em duas páginas, distingue contexto atual/histórico e adendo, troca de paciente pelos links da aplicação sem recarregar o documento, recarrega posteriormente e perde conteúdo ao revogar acesso; admin sem concessão é bloqueado. Dentista abre o contexto e o prontuário pela tela Consulta |
| PostgreSQL | Comparação de hashes de todas as linhas das três tabelas clínicas antes/depois do navegador: 11 registros, adendo e recibos preservados. Zero requisições de escrita clínica observadas no leitor |
| CI | [40748916671](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/40748916671), código `530f778`, aprovado: 508 frontend, 368 backend em 854,033 s, builds, regressões HTTP e auditorias de pacotes/seis imagens sem achados |

Harness: `scripts/smoke_clinical_reader_browser_homolog.py` e `.cjs`. API/schema/web temporários exclusivamente em `erp-dents-homolog`, dados fictícios, TLS validado e credenciais efêmeras via stdin. Limpeza aprovada, containers principais e volumes preservados.

Logs locais ignorados pelo Git: `.data/clinical-reader-tests.log`, `.data/clinical-reader-all-tests.log`, `.data/clinical-reader-build.log`, `.data/clinical-reader-image.log`, `.data/clinical-reader-browser.log`. Captura desktop fictícia `.data/homolog/clinical-reader-history.png` inspecionada: contexto atual/histórico, original e adendo separados e legíveis. Não constitui homologação da escrita clínica nem revisão visual em todos os tamanhos de tela. O harness foi ampliado durante o CI para verificar a navegação sem recarga e gerar a captura; não houve alteração adicional do produto.

## Próximo passo

4B.2: selecionar explicitamente a consulta, criar/salvar/reabrir rascunho, finalizar o texto salvo e adicionar correção, preservando autoria/versão e a tentativa em caso de resposta perdida. Cobrir conflito entre abas, troca de paciente e revogação com texto em edição antes de declarar o percurso clínico completo. A identificação da consulta deve acompanhar a escrita; as datas mostradas pelo leitor atual são as do registro, não as do agendamento.

CI registrado em `.data/clinical-reader-ci.log`. Auditoria das imagens `api`, `web`, `gateway`, `edge`, `db` e `clamav`: `{}`; base de vulnerabilidades atualizada em 28/10/2026 às 13:01:10 UTC. A consolidação posterior altera somente documentação e amplia o harness Chrome já executado; o produto permanece no código aprovado `530f778`.

Sem mudança de instalação ou configuração nesta entrega. Atualização/recuperação do conjunto clínico continua em 4C antes de ampliar o piloto. A instalação física dos cadastros permanece prioritária quando chegarem os dados do servidor.

### Retomada técnica da escrita (4B.2)

- `clinical-record-service.ts` contém apenas lista; acrescentar detalhe e mutações usando os contratos de 4A.2. `ClinicalRecord` já contém IDs de consulta/autor/dentista, versão e estado finalizado.
- `appointments_router.py` já aceita filtro de paciente/dentista e intervalo, sob `appointments.view`. A seleção deve mostrar paciente, dentista e horário e aceitar somente o vínculo do usuário; a API clínica revalida a autoria. Não conceder acesso à agenda implicitamente ao habilitar prontuário.
- Reabrir uma evolução pelo seu ID no histórico, inclusive após o agendamento passar. Ao iniciar pela consulta, resolver eventual registro já existente sem depender apenas da primeira página de dez itens.
- Separar texto em edição, versão carregada e tentativa em andamento. Ao enviar, capturar ação/alvo/versão/corpo/UUID; bloquear outra operação até conhecer o resultado. Em falha de rede/5xx, oferecer recuperação com exatamente a mesma tentativa. Não reutilizar a chave com texto modificado, nem gerar outra chave para repetir uma tentativa desconhecida.
- Conflito de versão exige revisão explícita; refetch de leitura não substitui automaticamente o texto digitado. Finalização envia somente chave/versão do rascunho salvo; adendo exige texto e motivo e não altera o original.
- Não persistir texto clínico em localStorage ou logs. Tratar troca de paciente, saída com rascunho e perda de permissão/sessão sem deixar conteúdo visível a outra identidade. Testar cada transição em componentes e Chrome/API/SQL.
