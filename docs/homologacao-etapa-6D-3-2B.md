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

## Ponto de retomada

**6D.3.2B.1 implementada, CI pendente:** produto `51bac6c`; cinco testes PostgreSQL/permissões (20,846 s), 39 frontend focados, builds API/web e HTTP aprovados. Chrome/API/SQL confirmou concessão, preservação ao editar outra permissão e revogação, com três eventos duráveis. [Relatório](./homologacao-etapa-6D-3-2B.md). [CI 42669676184](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/42669676184) em andamento. **Próximo imediato:** conferir CI e resolver eventual falha antes de fechar B.1; depois B.2, tela de histórico, estados/filtros/paginação/cache e aceite Chrome. Não repetir testes locais aprovados sem mudança/falha. Instalação v0.1.29/0027 preservada; recuperação 0028 e tag posterior. Principais preservados e recursos privados removidos.


## B.2 — tela preparada durante CI de B.1, 09/11

Base `666ba6e`. Para aproveitar a espera do CI, a tela foi implementada sobre a API localmente aprovada; B.1/B.2 não estão encerradas sem resultado do CI. Nenhuma nova tag.

- Rota /patient-audit e menu Histórico de pacientes protegidos por patient_audit.view. Campos traduzidos, instante clínico, IDs preservados, versões e mensagem explícita para salvamento sem mudança. Não exibe valores pessoais/clínicos nem consulta cadastro para inventar nomes históricos.
- Filtros por ação/autor/paciente/período, aplicação explícita e limpeza; IDs/intervalos validados, 25 eventos por página via cursor. Atualização/filtro retorna à primeira página.
- Estados de carregamento/vazio/erro separados; erro de rede mantém aviso sobre dados antigos. Revogação oculta eventos e limpa cache; sem armazenamento persistente.
- Seis testes de componentes aprovados em 2,67 s; TypeScript/Vite e imagem web aprovados. Logs .data/patient-audit-ui-tests.log, .data/patient-audit-ui-build.log e .data/patient-audit-ui-image.log.
- Chrome/API/SQL aprovado: 25+7 eventos, filtros com estação em Nova York, intervalo clínico correto, vazio, erro 503/recuperação, leitor negado/concedido/revogado. SQL preserva os 32 eventos sintéticos e registra duas concessões administrativas. Fixture histórica inserida diretamente por SQL, não representa autoria autenticada histórica. Log .data/patient-audit-ui-chrome.log.
- Capturas desktop e 390 px inspecionadas em .data/patient-audit-history-desktop.png e .data/patient-audit-history-mobile.png, somente fictícias e fora do Git; sem rolagem horizontal da página. Não constitui aceite de todas as telas móveis.
- Regressão Chrome/API/SQL de cadastros na imagem final aprovada: CPF, nascimento, RG, histórico, permissões, busca, conflito e reabertura; bootstrap/reinício/limpeza aprovados. Log .data/patient-audit-ui-registration.log. CI final pendente; recuperar 0028 e publicar tag apenas após aceites.
