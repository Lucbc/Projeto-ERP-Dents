# 4B.1 — leitura do prontuário e contexto do paciente

## Escopo

Início em 28/10/2026, base `8ecc799`. Leitura implementada e aceita localmente; CI pendente. A escrita pela interface permanece em 4B.2. A versão de instalação continua `piloto-cadastros-v0.1.24`, sem migração clínica.

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
| Chrome + API | Leitor de recepção abre pela lista, percorre 11 registros em duas páginas, distingue contexto atual/histórico e adendo, troca de paciente, recarrega e perde conteúdo ao revogar acesso; admin sem concessão é bloqueado. Dentista abre o contexto e o prontuário pela tela Consulta |
| PostgreSQL | Comparação de hashes de todas as linhas das três tabelas clínicas antes/depois do navegador: 11 registros, adendo e recibos preservados. Zero requisições de escrita clínica observadas no leitor |
| CI | Pendente antes do fechamento |

Harness: `scripts/smoke_clinical_reader_browser_homolog.py` e `.cjs`. API/schema/web temporários exclusivamente em `erp-dents-homolog`, dados fictícios, TLS validado e credenciais efêmeras via stdin. Limpeza aprovada, containers principais e volumes preservados.

Logs locais ignorados pelo Git: `.data/clinical-reader-tests.log`, `.data/clinical-reader-all-tests.log`, `.data/clinical-reader-build.log`, `.data/clinical-reader-image.log`, `.data/clinical-reader-browser.log`. Aceite do navegador é funcional; não constitui homologação da escrita clínica nem revisão visual em todos os tamanhos de tela.

## Próximo passo

Concluir CI e conferir publicação. Depois 4B.2: selecionar explicitamente a consulta, criar/salvar/reabrir rascunho, finalizar o texto salvo e adicionar correção, preservando autoria/versão e a tentativa em caso de resposta perdida. Cobrir conflito entre abas, troca de paciente e revogação com texto em edição antes de declarar o percurso clínico completo. A identificação da consulta deve acompanhar a escrita; as datas mostradas pelo leitor atual são as do registro, não as do agendamento.

Sem mudança de instalação ou configuração nesta entrega. Atualização/recuperação do conjunto clínico continua em 4C antes de ampliar o piloto. A instalação física dos cadastros permanece prioritária quando chegarem os dados do servidor.
