# 6D.3.2B — leitura protegida do histórico de pacientes

## B.1 — API e concessão, início 09/11/2026

Base `a6b05b0`. Implementação em validação; tela de histórico fica em B.2. Instalação permanece v0.1.29.

### Contrato

- GET /api/patient-audit retorna somente metadados tipados: IDs, instante, ação, versões e nomes dos campos alterados. Sem nomes/CPF/conteúdo clínico. Nenhum endpoint de alteração do histórico.
- Recurso patient_audit, somente view: administrador ativo pode consultar; outros perfis exigem concessão explícita. Concessão administrativa ou acesso a pacientes não substitui esta permissão. Normalizador, verificador, tipos e matriz frontend preservam o recurso e recusam ações de escrita.
- Reconsulta usuário ativo, sessão e permissão sob o bloqueio administrativo, incluindo quando uma revogação ocorre enquanto a leitura aguarda.
- Páginas de 25 (máximo 100), cursor por instante/ID decrescentes; filtros por paciente, autor, ação e intervalo com fuso. Início inclusivo, fim exclusivo. Não promete fotografia imutável entre páginas; UUIDs históricos podem não existir mais no cadastro.
- Resposta no-store, campos explícitos e SQL parametrizado. Sem nova migração além de 0028.

### Validações locais

- Cinco testes PostgreSQL/permissões aprovados em 20,846 s: defaults, ações somente leitura, filtros/paginação/empates, ausência de escrita, validação, sessão e revogação concorrente. Log ignorado .data/patient-audit-reader-tests.log.
- 39 testes frontend focados aprovados em 15,13 s: inclui nova cobertura por perfil e preservação da concessão ao salvar outra permissão. Build TypeScript/Vite aprovado (aviso de tamanho de bundle já existente).
- Imagens API/web construídas. HTTP privado aprovado: escrita/rollback anteriores, leitura negada/concedida/revogada, normalização das ações, paginação, filtros inválidos e recusa de POST. Bootstrap/reinício/limpeza aprovados, recursos principais preservados. Log .data/patient-audit-reader-http.log.
- Chrome/API/SQL da matriz aprovados: concessão, recarga, preservação ao editar outra permissão e revogação; três eventos administrativos duráveis conferidos. Bootstrap/reinício/limpeza aprovados. Log .data/patient-audit-permission-chrome.log. Não é aceite da futura tela de histórico.
- CI completo ainda não concluído. Ajuste local inicial de codificação UTF-8 corrigido antes dos testes aprovados; nenhuma alteração de regra para contornar falhas.

### Próximo

Concluir CI e registrar resultado antes de fechar B.1. B.2 acrescentará tela, filtros/cache/estados e aceite visual do histórico; C ampliará recuperação/migração de 0028 antes de nova tag. Não instalar main parcial.
