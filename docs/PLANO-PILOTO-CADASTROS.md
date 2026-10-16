# Entrada em uso — cadastros na clínica

## Situação atual — 16/10/2026

**Liberado para instalação assistida: `piloto-cadastros-v0.1.2`.** [Liberação, evidências e limites](./LIBERACAO-PILOTO-CADASTROS.md). Aceites essenciais de instalação nova, recuperação e recepção aprovados; paginação entregue na U1.1. Busca por CPF sem pontuação/nome social aprovada na U1.2, incluindo CI `38902882227`. Próximo P3: outro Windows, acesso de segunda estação, backup e reinício físico; começar cadastros reais após esse checklist. Não declarar os demais módulos liberados.

## Decisão de prioridade — 15/10/2026

Solicitação do usuário: concluir 3B.2B, disponibilizar o ERP para começar os cadastros e corrigir os demais pontos em atualizações semanais. Confirmado: **digitação do zero; servidor em outro computador Windows**. Não há importação de clientes nesta entrada em uso. O ambiente deste desenvolvimento continua sendo homologação, não o servidor da clínica.

**3B.2B concluída**: [evidências](./homologacao-etapa-3B-2B.md), CI `38728715724` aprovado, 307 backend/379 frontend. A sequência antiga 3B.2C fica adiada. Não reabrir toda a revisão antes de liberar o escopo de cadastros.

## Escopo inicial

- Cadastrar, localizar, consultar e editar pacientes. Administrador prepara usuários individuais e os cadastros auxiliares necessários (dentistas, especialidades e procedimentos).
- Acesso das estações pelo navegador e atalho para uma única URL HTTPS da rede; somente o servidor executa Docker e armazena os dados.
- Configurar permissões para o trabalho autorizado de cada usuário. Agenda, financeiro e atendimento/prontuário não são critérios de liberação deste piloto; não anunciar esses módulos como homologados para a operação clínica completa.
- Nenhuma senha de uso real no README, Git ou pacote distribuído. Administrador criado no primeiro acesso; código de ativação local, com procedimento de guarda apropriado.

## O que já está comprovado e o que falta

| Área | Estado atual verificado | Decisão para entrada em uso |
| --- | --- | --- |
| Cadastro e edição | Ensaios existentes de pacientes, controle de versão, autorização e preservação; exibição de nascimento corrigida em 3B.1 | Reutilizar evidências; homologar o percurso final de recepção no pacote instalado |
| Servidor | `docker-compose.yml` tem projeto de produção, volumes persistentes, HTTPS, reinício dos serviços e bootstrap | Falta pacote/assistente operacional para Windows e ensaio de instalação/reinício; não usar volumes de homologação na clínica |
| Estações | Frontend acessível por navegador; não exige instalação da API/banco em cada PC | Configurar nome/IP estável, certificado confiável, acesso de rede e atalho; provar em segunda estação |
| Backup e restauração | Cópias e comparação de preservação usadas no desenvolvimento; README reconhece restauração assistida pendente | Entregar procedimento executável, testar restauração isolada antes dos cadastros reais e definir responsável/destino da cópia |
| Atualização | CI e migrações existentes; processo atual conduzido pelo desenvolvedor | Entregar versão identificada, backup prévio, verificações e recuperação documentada para a rotina semanal |
| Busca e volume | Pacientes têm busca e aviso de limite; `limit: 100`, sem navegação de páginas. CPF/telefone não são normalizados e nome preferido não participa da busca | Priorizar percurso de localização e prevenção de recadastro; paginação e busca vêm antes de ampliar volume. Não bloquear cadastro por exigir CPF de todos |
| Importação | Usuário confirmou digitação do zero | Remover importador da fila de entrada em uso; não inventar formato de planilha |

Inspeção em 15/10: [Compose](../docker-compose.yml), [bootstrap](../scripts/configure-bootstrap.ps1), [pacientes](../apps/api/src/core/use_cases/patient_use_cases.py), [busca](../apps/api/src/adapters/db/repositories/patient_repository.py). Não foi feita instalação no computador da clínica nem ensaio em estação física nesta preparação.

## Ordem de trabalho, com entregas verificáveis

### P1 — pacote Windows para instalar e recuperar

**P1.3B concluída em 15/10/2026:** recuperação da aplicação com cópia de configuração/TLS, API/frontend privados, login original, cadastro/edição, exames anteriores/novos, Chrome e reinício aprovados; origem preservada. **Próximo: consolidar aceite da instalação nova e percurso essencial P2.** Avisar explicitamente quando liberado para instalação e cadastros, sem condicionar às melhorias gerais adiadas. Outra máquina/segunda estação continuam no aceite físico P3.

**P1.3A concluída em 15/10/2026:** [backup e recuperação](./BACKUP-RECUPERACAO.md), rotina Windows e ensaio de restauração de dados. Duas restaurações isoladas com tabelas públicas/exame iguais, API reiniciada inclusive após falha injetada, HTTPS `/health` 200. **Próximo P1.3B: recuperação da aplicação completa isolada**, login/cadastro/download e configuração/TLS. Não confundir integridade do banco/arquivos com aceite do serviço restaurado. Nenhuma instalação na clínica.

**P1.2B concluída no escopo local em 15/10/2026:** emissão TLS assistida Windows/OpenSSL, DNS/IPv4, proteção de chave, validação criptográfica e preservação de destino; testes aprovados em arquivos fictícios. Roteiro atualizado para confiança e renovação (nova autoridade a cada emissão, certificado de servidor 365 dias). Sem importação de confiança nem alteração do HTTPS ativo. **Próximo P1.3: backup/restauração isolada**; ensaio do pacote integrado deverá incluir acesso HTTPS e renovação, além de instalação/reinício. Não houve novo teste API/banco/interface; estações físicas continuam em P3.

Validação P1.2A: `powershell -NoProfile -File scripts/test-configure-server.ps1 -CheckCompose` aprovado; também comprovada aceitação da configuração gerada pelo Compose (`config --quiet`, projeto explícito `erp-dents-homolog`, sem iniciar serviços). Links locais conferidos. Não equivale a teste de instalação, API, banco ou navegador.

**P1.2A concluída em 15/10/2026:** `scripts/configure-server.ps1` gera configuração inicial Windows, valida origem HTTPS DNS/IPv4, cria três segredos independentes, restringe ACL antes de escrever e recusa arquivo existente. `scripts/test-configure-server.ps1` aprovado em PowerShell local com arquivos fictícios isolados: 11 URLs inválidas, DNS/IPv4, portas padrão/customizada, coerência banco/origem, ausência de segredos na saída, ACL e preservação. Roteiro atualizado para o comando único. Sem containers, volumes ou novas validações API/banco/interface. **Próximo P1.2B: certificado de produção assistido e confiança nas estações**, seguido de backup/restauração e instalação integrada. P1 continua em andamento.

**P1.1 concluída em 15/10/2026:** [roteiro de instalação](./INSTALACAO-CLINICA-WINDOWS.md) e diagnóstico somente de leitura `scripts/check-server.ps1`. Cinco cenários simulados aprovados (disponível, engine indisponível, containers Windows, Compose antigo e saída inválida); diagnóstico real aprovado no Docker local. Não houve instalação de produção nem novo ensaio API/banco/interface. P1 permanece em andamento. **Próximo P1.2:** preparar configuração/TLS de produção de forma assistida, preservando arquivos existentes e homologando o preparo em recursos isolados; depois backup/restauração e instalação completa. Não confundir o diagnóstico inicial com aceite de todo P1.

Primeiro trabalho: inventariar as entradas do Compose/HTTPS/bootstrap e entregar um comando/assistente de servidor com ações claras de instalar, status, backup e restauração assistida. Usar PowerShell e Docker; evitar exigir Node/Python nas estações ou conhecimentos de API/CORS. Reutilizar os componentes existentes.

Critérios: instalação vazia isolada, administrador inicial sem credenciais compartilhadas, projeto/volumes identificados e reaproveitados ao executar novamente, URL de acesso, diagnóstico sem segredos, backup de banco/exames/configuração necessária e restauração em ambiente isolado. Nunca usar `down -v` nem apagar volumes para resolver migração. O pacote deve explicar o início do Docker após reinício do Windows; reiniciar containers não comprova reinício do computador.

Homologar somente em `erp-dents-homolog` ou schemas/recursos privados desse projeto, com dados fictícios. Não executar o instalador de produção neste computador para testar. Parametrizar o alvo de teste com verificações que impeçam cruzar projetos/volumes.

### P2 — percurso de cadastro com a recepção

Configurar contas individuais/permissões e validar cadastro → busca → edição → reabertura em duas sessões. Provar nascimento sem mudança de dia, paciente sem CPF, nomes semelhantes e conflito de edição. Priorizar busca/paginação que evite considerar paciente existente como ausente; preservar os identificadores existentes. Escopo inicial não exige implementar todo R23, prontuário ou financeiro.

Aceite essencial aprovado com 105 pacientes prévios, busca por nome/CPF, cadastro sem CPF e edição concorrente. Paginação entregue na U1.1; na versão liberada, orientar consulta pelo nome completo/social ou CPF com/sem pontuação e conferir as páginas, sem interpretar os primeiros 100 como todos os pacientes. Busca ampliada aprovada na U1.2. Nenhuma exposição de dados reais nos testes.

### P3 — instalação no servidor e início supervisionado

Aplicar pacote no **outro Windows**, após identificar máquina/recursos, URL da rede e destino de backup. Provar acesso em uma segunda estação, criar atalho, cadastrar/editar/localizar um paciente de teste e executar backup/restauração de ensaio. Separar configuração técnica pelo suporte da rotina diária do usuário.

Só então indicar que os cadastros reais podem começar. Não transferir credenciais ou banco de homologação para produção. A ausência de acesso a essa máquina é uma dependência de implantação, não motivo para interromper a construção e validação do pacote.

### P4 — atualização semanal do servidor

Preparar uma versão identificada por commit/tag e entregar notas curtas: mudanças, cuidados, duração estimada medida no ensaio e recuperação. Agendar a janela com o responsável da clínica; não instalar automaticamente uma branch em movimento.

Sequência: conferir versão/estado → interromper escritas durante backup coerente → copiar banco/exames e configuração necessária com acesso restrito → aplicar versão → migrar sem perda → verificar login/cadastro/busca e integridade → reabrir uso. Se houver falha, preservar evidências/dados e recuperar pelo roteiro ensaiado. Reverter imagem não garante reversão de migração; não executar downgrade automático. Não restaurar uma cópia antiga sobre cadastros novos sem decisão explícita.

A cadência semanal é a prioridade acordada; dia/horário e execução no servidor serão definidos com a clínica. Não foi criado agendamento automático nesta entrega.

## Fila adiada

- 3B.2C/D: atraso financeiro e fechamento do dia clínico.
- 3B.3/3B.4: instantes/calendário e contrato de offset/null, salvo falha que impeça cadastro.
- Prontuário, financeiro ampliado, desempenho geral, reorganizações e limpeza de código sem impacto no piloto.

Correção de perda de dados, acesso indevido, indisponibilidade ou bloqueio de cadastro tem prioridade sobre essa fila e sobre a janela semanal. Demais itens continuam rastreados no plano original.

## Retomada

**Próximo: apoiar P3 — instalar a versão liberada no outro Windows e concluir checklist local.** Aceites essenciais P1/P2 e melhorias U1.1/U1.2 aprovados; detalhes e limites no documento de liberação. Origem dos dados e sistema operacional já respondidos: digitação do zero, outro Windows. Windows Home e 16 GB são estimativas; edição/build e recursos aguardam confirmação. Backup externo será manual semanal na nuvem, com provedor/conta/pasta ainda a definir. Não continuar automaticamente em 3B.2C. Ao alterar, atualizar o roteiro, registrar evidências, commit/push e conferir remoto. Preparar o procedimento P4 de atualização semanal, sem condicionar a instalação inicial às melhorias gerais.
