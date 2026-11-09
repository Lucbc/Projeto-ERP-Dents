# 6D.3.2A — gravação do histórico de edição de pacientes

Início em 09/11/2026, base `98ea27c`. Implementação em validação; não declarar subetapa concluída antes dos aceites.

## Mudanças

- Migração aditiva 0028 cria patient_audit com metadados, índices por paciente/ator, unicidade paciente/versão e guardas contra UPDATE/DELETE/TRUNCATE/downgrade com eventos. IDs sem FK para preservar histórico após exclusão. Sem backfill.
- PUT recebe usuário autenticado do servidor e transmite actor_id pela porta/caso de uso. Valores enviados como autor pelo cliente não escolhem a autoria.
- Repositório captura valores escalares após a guarda de CPF e antes do UPDATE versionado; a atualização e o evento são confirmados juntos. Comparação usa dados normalizados; edição sem mudança mantém incremento e evento vazio.
- Chamadores internos/fixtures antigos podem omitir ator, como na auditoria administrativa; o único caminho HTTP de edição sempre fornece usuário autenticado. Criação/exclusão não passam a ser auditadas neste recorte.
- Sem endpoint de leitura, permissões novas ou tela nesta subetapa; não usar permissão administrativa para expor pacientes.

## Validação e limites

Build da API aprovado. Sete testes novos cobrem normalização/null/omissão/no-op, rollback após INSERT, versões concorrentes, CPF concorrente, falhas de validação/CPF duplicado, preservação após exclusão e imutabilidade/migração. Regressões existentes de concorrência, CPF e datas em execução. Resultados finais registrados no ponto de retomada.

Ensaio HTTP privado acrescentado ao CI: sessão/autoria, recusa anônima/permissão, CPF inválido, versão obsoleta, falha induzida de INSERT e ausência de conteúdo pessoal. Expectativas iniciais do harness foram corrigidas para o contrato existente: escrita anônima 403, CPF inválido 400. Ensaios interrompidos não são aprovação.

Somente erp-dents-homolog, esquemas/contêineres privados e dados fictícios. Principais não reiniciados; nenhum volume removido. Logs locais ignorados: `.data/patient-audit-tests.log`, `.data/patient-audit-final-tests.log`, `.data/patient-audit-http.log`, `.data/patient-audit-build.log`.

## Retomada

Concluir testes locais e CI antes de declarar A concluída. Depois B: consulta protegida e interface; C: migração/recuperação completa e publicação. O harness de recuperação anterior espera head=0027 e deverá ser ampliado para 0028 em C, não usado como prova da nova migração. Instalação permanece na tag v0.1.29/0027; não instalar main parcial.
