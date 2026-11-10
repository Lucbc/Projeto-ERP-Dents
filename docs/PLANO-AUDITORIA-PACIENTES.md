# 6D.3.2 — histórico de edição de pacientes

**Publicação concluída — 10/11/2026:** `piloto-cadastros-v0.1.30` = `d13c7e29bb23de10f763a53e0ac3ee692927be93`, publicada e conferida no remoto. Verificador Git aprovou avanço do checkout limpo v0.1.29; aplicação/imagens/Compose idênticos ao produto `a296fa9` aprovado no CI. Guias alinhados à migração 0028. Instalação assistida de cadastros disponível após checklist físico. Próximo: P3 quando houver dados do servidor; enquanto aguardamos, desenhar o recorte de auditoria de leitura clínica/download antes de implementar. Não repetir 6D.3.2 sem nova falha/mudança. Odontograma posterior. Este fechamento substitui as pendências de publicação abaixo.


## Diagnóstico em 09/11/2026

Base `9202bd9`. Inspeção estática concluída; não é teste de API, banco ou navegador. Nenhuma mudança de produto nesta preparação.

| Caminho inspecionado | Evidência | Consequência para a implementação |
|---|---|---|
| PUT em patients_router.py | Exige patients.update, mas não recebe/transmite o usuário ao caso de uso | Obter ator autenticado no servidor; nunca aceitar autor no payload |
| PatientUseCases.update | Normaliza textos antes do repositório | Comparar valores persistidos após normalização; não registrar o formulário bruto |
| SqlAlchemyPatientRepository._update | UPDATE com versão esperada; incrementa inclusive em edição sem mudança | Preservar esse contrato e registrar evento com lista vazia quando não houver diferença |
| _guard_cpf | Bloqueio transacional por CPF antes de procurar duplicado | Preservar ordem de locks; não acrescentar bloqueio de linha antes do lock de CPF sem analisar concorrência |
| create/creation_operations | Recibo por ator/chave, com replay, não trilha geral | Criação/exclusão ficam fora deste primeiro recorte; não anunciar histórico completo do paciente |
| Migração 0027 | Eventos administrativos limitados a usuário/perfil e campos próprios | Criar tabela específica; não ampliar silenciosamente a permissão administrativa para pacientes |
| Testes existentes | Concorrência, CPF, datas, exclusão e recibos em módulos separados | Reexecutar regressões pertinentes após mudança; não considerar leitura dos testes como execução |

Fontes: [router](../apps/api/src/api/routers/patients_router.py), [caso de uso](../apps/api/src/core/use_cases/patient_use_cases.py), [repositório](../apps/api/src/adapters/db/repositories/patient_repository.py), [0027](../apps/api/alembic/versions/0027_administrative_audit.py), [concorrência](../apps/api/tests/test_patient_concurrency.py).

## Contrato da primeira entrega

- Somente edições confirmadas, incluindo inativação/reativação via active. Não inclui criação, exclusão, leitura, download ou evolução clínica.
- Evento imutável com ID, instante do banco, ID do ator/paciente, ação patient.updated, versões anterior/posterior e lista dos campos efetivamente alterados. Não persistir nomes, CPF, telefones, valores anteriores/novos, texto de alergias/histórico/observações, payload, senha ou tokens.
- Campos limitados à lista explícita de edição do repositório; version não é campo de conteúdo. Ausência versus null e normalização seguem o comportamento atual.
- Identificadores sobrevivem à exclusão de conta/paciente, sem cascata que apague eventos. Não reconstruir autoria histórica.
- Evento e edição na mesma transação. Erro ao gravar evento desfaz edição e incremento; 403/404/409/validação não geram evento de sucesso.
- Edição sem diferença mantém incremento atual e gera evento sem campos alterados; interface deve explicar “salvamento sem alteração de campos”, não inventar uma mudança.
- Capturar estado anterior compatível com a versão efetivamente atualizada. O objeto ORM retornado com populate_existing pode substituir os valores antigos: guardar cópia explícita antes do UPDATE. Se concorrência vencer, não aproveitar a cópia para um evento falso.
- Não mudar regras de CPF, nascimento, conflito de versão, sessão ou rascunhos. Validar a ordem dos bloqueios com duas sessões reais, incluindo CPF concorrente.
- Recurso de leitura próprio patient_audit, somente view, com concessão explícita para operadores; administrador pode consultar metadados. Não usar administrative_audit.view como autorização implícita. Leitura de valores clínicos continua fora deste contrato.
- Leitura paginada e filtrada por paciente/ator/período, sem endpoint de alteração; revogação deve ocultar dados e remover cache. Não exigir leitura do cadastro inteiro para consultar metadados de paciente já excluído.

## Subetapas e aceites

### 6D.3.2A — gravação

Migração aditiva após 0027, tabela/índices/guardas contra UPDATE/DELETE/TRUNCATE e downgrade destrutivo; transmitir ator pelo router/porta/caso de uso. Revisar todos os chamadores e fixtures para não criar caminho HTTP sem autoria.

**PostgreSQL:** uma edição/um evento; campos após normalização; null/omissão/sem diferença; active; duas versões concorrentes; CPF duplicado inclusive inativo; falha induzida no INSERT reverte tudo; preservação após exclusão do ator/alvo. Migração preserva linhas existentes e inicia histórico vazio.

**HTTP:** ator da sessão; payload não escolhe autoria; negação, conflito e erro de validação sem evento; sucesso com nova versão; dados fictícios exclusivamente em erp-dents-homolog.

### 6D.3.2B — consulta e tela

Permissão própria em backend/frontend/matriz, API com limites/cursor, estados de carregamento/vazio/erro e apresentação clara dos IDs históricos. Conferir administrador, concedido, negado, revogado e ausência de armazenamento persistente. Validar componentes e Chrome/API/SQL separadamente, além de regressão de cadastros.

### 6D.3.2C — recuperação e publicação

Dump e backup operacional completo devem preservar eventos, restrições, configuração e exames. CI e guias atualizados antes de nova tag. Não substituir v0.1.29 por implementação parcial.

## Estado da implementação em 10/11

A/B/C concluídas: gravação atômica, consulta com permissão própria, tela, Chrome/API/SQL, CI final (552 frontend/392 backend), migração e recuperação operacional aprovados. Produto `a296fa9`; [recuperação e limites](./homologacao-etapa-6D-3-2C.md). Publicação v0.1.30 em fechamento. Observações abaixo são diagnóstico histórico; R32 geral permanece aberto.

## Limites do diagnóstico inicial

Nenhuma trilha nova foi implementada neste diagnóstico. R32 continua aberto; não é requisito adicional para iniciar os cadastros com v0.1.29 após checklist físico. Sem retenção/expurgo/exportação automático ou prazo presumido. Próximo imediato: implementar 6D.3.2A conforme os aceites acima. Odontograma permanece posterior.
