# 6A — evidências e próximas verificações

Data: 29/10/2026. Base inspecionada: `c770e32`. Etapa documental concluída; nenhum teste funcional novo executado. Instalação permanece `piloto-cadastros-v0.1.25`.

## O que está aprovado e o que isso prova

| Fluxo | Evidência existente | Limite do aceite |
| --- | --- | --- |
| Cadastros, CPF, permissões e conflitos | Reexecução Chrome/API/SQL registrada no ponto 4C.3 do [plano](./PLANO-DE-EXECUCAO.md) e [pacote v25](./ATUALIZACAO-PRONTUARIO-V25.md) | Não mede capacidade com muitos usuários nem substitui checklist do servidor real |
| Recepção → consulta → dentista → cobrança → pagamento | [Percurso operacional](./homologacao-percurso-operacional.md), interface/HTTP/SQL com contas distintas | Financeiro executado por administrador; falta percurso com operador de permissões restritas. Não cobre parcelamento |
| Datas e agenda | [Matriz 3B.5](./homologacao-etapa-3B-5.md), evidências por camada | Cobertura visual histórica/multidia pendente; R21 não está encerrado para todos os campos |
| Rascunho, finalização, adendo e conflitos clínicos | [4B.2](./homologacao-etapa-4B-2.md), componentes/Chrome/API/SQL | Concorrência funcional entre abas não é ensaio de carga sustentada |
| Migração 0025→0026 e preservação | [4C.1](./homologacao-etapa-4C-1.md), API/PostgreSQL e comparação de dados | Bancos privados de homologação; não é instalação no computador da clínica |
| Backup completo e uso após restauração | [4C.2](./homologacao-etapa-4C-2.md), Windows/HTTPS/SQL/Chrome, exames e prontuário | Falta ensaio físico na clínica e rotina real de cópia externa |
| Regressão automatizada | [CI 40879673431](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/40879673431): 517 frontend, 368 backend, builds/HTTP e auditorias | Código funcional `4eb6ef5`, preservado no pacote v25; contagem de testes não prova usabilidade ou capacidade |

## Lacunas priorizadas e conferidas

1. **6B — capacidade de uso simultâneo.** `use-appointment-references.ts` chama `patientService.listAll`; `services.ts` percorre páginas em `fetchAllPages`. A seleção de pacientes carrega a coleção completa. Medir abertura da agenda/formulário e busca com acervo maior antes de escolher paginação/autocomplete ou outro ajuste. Não foi demonstrada lentidão nesta etapa.
2. **6B — contenção no prontuário.** `clinical_record_repository.py` usa `administration_lock` também em `get`, `get_for_appointment` e `list_for_patient`. `user_repository.py` implementa `LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`. Medir leituras clínicas concorrentes com gravações e operações de sessão. Preservar as garantias de revogação/autoria; não remover a proteção para melhorar números.
3. **6C — usabilidade e perfil financeiro restrito.** Executar percurso representativo por teclado, foco de modal, mensagens de erro e retorno à lista; repetir apenas o trecho financeiro com conta explicitamente autorizada, sem privilégios de administrador. O comportamento atual da Consulta limita a lista a 100 e informa que é preciso refinar a busca; isso não é perda comprovada de registros. Verificar descoberta de paciente fora dos primeiros 100 pela busca.
4. **Depois dos percursos principais — pendências delimitadas.** R21 residual, agenda histórica/multidia e auditoria geral de acesso/alterações (R32) continuam separados. Histórico de autoria clínica não equivale a trilha de leitura/download de todos os módulos. Antes de corrigir cada item, reproduzir no código atual. Achados antigos de código morto, dependências e acessibilidade não serão tratados automaticamente como ainda presentes.
5. **P3 — ambiente real.** Windows/recursos/rede, reinício, acesso nos computadores, backup externo e restauração assistida permanecem no [checklist de início](./CHECKLIST-INICIO-CLINICA.md). Prioridade quando chegarem as informações do servidor.

## Próximo ensaio 6B.1

Objetivo: obter uma linha de base reproduzível de cadastros, agenda e leitura clínica, sem mudar o produto antes de medir.

- Usar apenas `erp-dents-homolog`, banco/schema privado e dados fictícios; preservar containers e volumes principais. Reaproveitar isolamento dos harnesses existentes e limpar somente os recursos privados autorizados.
- Registrar revisão, imagens, recursos disponíveis, tamanho da base, quantidade de sessões e duração. Quantidade real de usuários e pacientes foi perguntada e continua pendente; não apresentar uma estimativa de engenharia como capacidade prometida à clínica.
- Na ausência da estimativa, começar provisoriamente com 1 e 5 sessões, bases de 100 e 1.000 pacientes fictícios, aquecimento de 1 minuto e medição de 5 minutos por cenário. Esses números são uma linha de base, não limite suportado ou requisito acordado. Ampliar somente conforme resultado/estimativa recebida.
- Separar abertura simultânea de telas do uso normal. `use-live-query.ts` atualiza telas visíveis/online a cada 15 segundos, reduz frequência após erro e atualiza ao recuperar foco/conexão. Representar esse ritmo e registrar a mistura de requisições, sem confundir disparos HTTP contínuos com cinco operadores.
- Medir p50/p95/máximo de latência, volume de respostas, erros inesperados e timeouts por operação; observar CPU/memória/conexões/esperas no banco. Relatar limites da máquina de desenvolvimento. Ainda não há meta de latência acordada ou capacidade física validada.
- Conferir API e SQL depois das gravações concorrentes: quantidade esperada, ausência de duplicação, CPF protegido e conflito de edição preservado. Separar conflitos esperados de falhas inesperadas.
- Fazer amostra Chrome com carga ativa: localizar paciente, abrir formulário da agenda e ler prontuário com permissão. Medição HTTP não encerra aceite da interface.
- Critério de conclusão do diagnóstico: cenários e métricas reproduzíveis, invariantes verificadas, evidências separadas por camada e decisão justificada sobre o primeiro gargalo. Qualquer erro inesperado, perda/duplicação ou quebra de autorização exige investigação antes de recomendar ampliação de uso. Não declarar desempenho aprovado apenas por ausência de erro.

## Decisão de entrega

6A encerra a consolidação, não a homologação integral do ERP. Próximo trabalho: 6B.1. Cadastros continuam preparados para instalação assistida; não precisam aguardar todos os aprimoramentos do ERP. Não houve alteração do procedimento de instalação, migração, dependência ou código nesta etapa, portanto não há nova tag nem repetição do CI funcional.
