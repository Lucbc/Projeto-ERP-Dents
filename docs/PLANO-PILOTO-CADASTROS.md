# Entrada em uso — cadastros na clínica

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

**P1.1 concluída em 15/10/2026:** [roteiro de instalação](./INSTALACAO-CLINICA-WINDOWS.md) e diagnóstico somente de leitura `scripts/check-server.ps1`. Cinco cenários simulados aprovados (disponível, engine indisponível, containers Windows, Compose antigo e saída inválida); diagnóstico real aprovado no Docker local. Não houve instalação de produção nem novo ensaio API/banco/interface. P1 permanece em andamento. **Próximo P1.2:** preparar configuração/TLS de produção de forma assistida, preservando arquivos existentes e homologando o preparo em recursos isolados; depois backup/restauração e instalação completa. Não confundir o diagnóstico inicial com aceite de todo P1.

Primeiro trabalho: inventariar as entradas do Compose/HTTPS/bootstrap e entregar um comando/assistente de servidor com ações claras de instalar, status, backup e restauração assistida. Usar PowerShell e Docker; evitar exigir Node/Python nas estações ou conhecimentos de API/CORS. Reutilizar os componentes existentes.

Critérios: instalação vazia isolada, administrador inicial sem credenciais compartilhadas, projeto/volumes identificados e reaproveitados ao executar novamente, URL de acesso, diagnóstico sem segredos, backup de banco/exames/configuração necessária e restauração em ambiente isolado. Nunca usar `down -v` nem apagar volumes para resolver migração. O pacote deve explicar o início do Docker após reinício do Windows; reiniciar containers não comprova reinício do computador.

Homologar somente em `erp-dents-homolog` ou schemas/recursos privados desse projeto, com dados fictícios. Não executar o instalador de produção neste computador para testar. Parametrizar o alvo de teste com verificações que impeçam cruzar projetos/volumes.

### P2 — percurso de cadastro com a recepção

Configurar contas individuais/permissões e validar cadastro → busca → edição → reabertura em duas sessões. Provar nascimento sem mudança de dia, paciente sem CPF, nomes semelhantes e conflito de edição. Priorizar busca/paginação que evite considerar paciente existente como ausente; preservar os identificadores existentes. Escopo inicial não exige implementar todo R23, prontuário ou financeiro.

Aceite em homologação com massa fictícia acima de 100 pacientes e registros com/sem pontuação; nenhuma exposição de dados reais nos testes. Documentar limites remanescentes compreensíveis para quem cadastra.

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

**Próximo: P1 — pacote Windows e backup/restauração para cadastros.** Não continuar automaticamente em 3B.2C. Origem dos dados e sistema operacional já respondidos: digitação do zero, outro Windows. Não pedir novamente. Preparar e testar o pacote em homologação antes de depender do acesso ao servidor da clínica. Ao alterar, registrar evidências, commit/push e conferir remoto como nas etapas anteriores.
