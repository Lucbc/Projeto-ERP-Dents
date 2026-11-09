# 6D.3.1B — consulta protegida da auditoria administrativa

## B.1 — API e concessão de leitura (início 07/11/2026)

Base `d5d14a6`, produto `267cee5`. B.1 concluída em 08/11/2026 após conferência dos resultados; B.2 também concluída conforme seção abaixo. Nenhuma tag instalável nesta subetapa.

### Contrato

- GET `/api/administrative-audit`: metadados tipados, sem nomes/e-mails/credenciais. IDs de contas excluídas permanecem consultáveis. Não existe endpoint para alterar eventos.
- Administrador ativo consulta; outros perfis precisam de concessão `administrative_audit.view`. Demais ações sempre falsas, inclusive no normalizador, no verificador e na matriz visual. A edição de outras permissões preserva a concessão de auditoria.
- Conta, sessão e permissão reconsultadas sob o mesmo bloqueio das alterações administrativas, antes da leitura. Revogação concluída enquanto a consulta aguarda impede a resposta de dados.
- Limite padrão 25, máximo 100. Ordem decrescente por instante/ID; cursor pela última chave, sem contagem total ou promessa de fotografia entre páginas. Filtros por ação, ator (`author_id`), usuário-alvo, perfil e período; usuário/perfil são mutuamente exclusivos. Início inclusivo, fim exclusivo; data/hora com fuso obrigatório. Filtros/cursor não concedem acesso.
- SQL vincula valores; resposta enumera campos permitidos. Cabeçalho `Cache-Control: no-store`. Sem novas tabelas/migrações além da 0027 já introduzida em A.

### Evidências aprovadas

- Cinco testes novos aprovados, 13,013 s: normalização, acesso/revogação/sessão, paginação sob inserção, empate de instante, filtros/intervalos e revogação concorrente real no PostgreSQL privado. `.data/audit-read-tests.log`.
- HTTP/SQL aprovado: anônimo 401, sem concessão 403, concessão/revogação na sessão existente, conta excluída/paginação/filtros, entradas inválidas e ausência de segredos. POST recusado e leituras não alteram o histórico. `.data/audit-read-http.log`; harness existente ampliado e incluído no CI.
- Build frontend e 535 testes de componentes aprovados localmente (`.data/audit-read-web.log`, 169,40 s). Ensaio focado de permissões: 34 testes aprovados.
- **Chrome/API/SQL:** controles de auditoria permitem apenas leitura; conceder, salvar outra permissão, recarregar e revogar preservam o contrato. Banco confirmou três eventos duráveis e concessão final revogada. `.data/audit-read-chrome.log`; scripts `smoke_audit_permission_browser_homolog.py/.cjs`. Isso homologa a matriz de concessões, não uma tela de histórico, que ainda não existe. API/esquema temporários removidos e dados/volumes principais preservados.
- **CI aprovado:** [42411551662](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/42411551662), produto `267cee5`: 535 frontend, 380 backend (734,253 s), fluxos HTTP e seis imagens sem achados. Resultado conferido em 08/11; execução de 07/11, log `.data/audit-read-ci-final.log`.

### Pendências e retomada

Próximo B.2: tela de consulta, estados/permissão/cache e Chrome. Antes de publicação: recuperação/migração 0026→0027, atualização do harness de recuperação, regressão de cadastros e guias/tag. Instalação nova v0.1.28 continua aguardando pacote com zlib corrigida; não instalar HEAD parcial. Dados/volumes principais preservados.

## B.2 — tela de histórico (início 08/11/2026)

Base `187f665`, produto `73b5b03`. Concluída em 08/11/2026. Rota `/administrative-audit` e menu seguem a permissão própria, sem exigir administração de usuários. Eventos mostram ação traduzida, instante de São Paulo, IDs preservados, versões e diferenças de campos/concessões; sem edição/exclusão/exportação.

Filtros aplicados explicitamente por ação, responsável, usuário/perfil e intervalo no fuso clínico. Valores inválidos não disparam consulta; mudança de filtro retorna à primeira página. Paginação de 25 por cursor com anterior/próxima; atualização retorna à primeira página. Erro de rede sinaliza dados desatualizados; vazio é distinto de erro. Revogação oculta eventos e remove cache; respostas não são persistidas no navegador.

Seis testes novos de componentes aprovados (incluindo recuperação de rede seguida de filtro vazio): identificação histórica/horário, paginação/filtros, validação, permissão/cache e erro/negação HTTP. Build e imagem web aprovados. Primeira regressão completa: 540 testes aprovados; teste adicional e correção focal: seis aprovados (2,32 s). Chrome/API/SQL e CI final aprovados. Harness usa 32 eventos sintéticos no esquema privado (não são autoria histórica real), conta fictícia e duas alterações de concessão. Capturas locais somente fictícias em `.data/audit-history-desktop.png` e `.data/audit-history-mobile.png`, fora do Git.

B.2 concluída nos aceites descritos. Migração/dump aprovados; backup operacional e publicação continuam pendentes; o roteiro de instalação ainda aponta a necessidade de tag corrigida, sem instalar HEAD parcial.

### Aceites locais B.2 — 08/11

- Chrome primeiro parou ao localizar o select por nome. A associação explícita label/ID de Ação e Perfil corrigiu o problema em `73b5b03`; o CI anterior `42509292708` foi cancelado para testar a versão final no [CI 42509603594](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/42509603594), aprovado: 541 frontend, 380 backend (795,310 s), HTTP e seis imagens sem achados. Log local `.data/audit-ui-ci-final.log`. Não tratar os ensaios interrompidos como aprovados.
- Chrome final: administrador vê 25+8 eventos em páginas, filtros reduzem corretamente o período clínico mesmo com estação em Nova York, IDs históricos permanecem visíveis; erro 503 mantém aviso e recuperação funciona; resultado vazio explícito. Operador sem concessão não tem menu nem página, autorizado consulta sem administração de usuários e revogação retira eventos. SQL preserva os 32 eventos sintéticos e confirma duas alterações de concessão. `.data/audit-ui-chrome-final.log`.
- Capturas desktop e 390 px inspecionadas; texto/IDs quebram linha sem rolagem horizontal da página. Isso não é um aceite geral de todas as telas móveis do ERP.
- Cadastros Chrome/API/SQL aprovados na imagem final: CPF, nascimento, históricos, RG, permissão/conflito/reabertura e inicialização. `.data/audit-ui-registration.log`.

## Recuperação antecipada — 08/11

- Harness `smoke_clinical_recovery_homolog.py` atualizado para migrar 0025→0026, inserir rascunho clínico fictício por SQL, depois 0026→0027. Compara todas as linhas/tabelas existentes e verifica ausência de eventos inventados. Fixture SQL não representa escrita clínica autenticada histórica.
- Ensaio de banco/API aprovado (`.data/audit-recovery.log`): três eventos reais de concessão/criação/exclusão, usuário excluído ainda representado, leitor negado; dump/restauração com todas as contagens e hashes iguais; proteções restauradas recusam UPDATE/DELETE/TRUNCATE da auditoria. API recupera IDs/atores/alvos/instantes/versões/diferenças e mantém o fluxo clínico. Bancos/arquivo/contêiner temporários removidos, principal preservado.
- Ensaio operacional `smoke_clinical_full_recovery_homolog.py` adaptado ao contrato atual de criação clínica e à conferência dos eventos/permissões após restauração; execução bloqueada neste computador por confiança Windows/domínio ao aplicar a ACL da pasta de backup. Diagnóstico limitado a categoria segura, sem saída bruta. `.data/audit-full-recovery-final.log`. Não tratar como backup completo aprovado. Nenhuma nova tag publicada.

- Correção no preparador do ensaio: PowerShell usa agora `$ErrorActionPreference='Stop'` também ao proteger a pasta inicial. Antes, erro não terminante de Set-Acl podia permitir continuar a preparação fictícia. Nova execução interrompeu antes de ler configuração do ambiente/criar credenciais/bancos/volumes; pasta mais recente contém somente `protect.ps1`. `.data/audit-recovery-acl-guard.log`. A proteção do script operacional já interrompia em falha e não foi removida. Ensaios anteriores limparam contêineres/bancos privados no finally; seus volumes fictícios permanecem retidos conforme contrato.
- **Próximo requisito de publicação:** repetir o ensaio operacional completo em Windows com confiança/conta corrigida, preservando ACL, configuração e volumes. O aceite do dump não cobre exames/configuração/TLS. Não corrigir vínculo de domínio automaticamente nem publicar uma nova tag com esse aceite pendente.


## Recuperação operacional — aceite de 09/11/2026

Base `175a27e`, sem alteração de produto ou scripts desde os aceites anteriores. Novo teste isolado em pastas vazias confirmou Set-Acl funcionando, herança desativada e três regras. Não foi alterada conta, associação ao domínio ou proteção; a causa da mudança de condição do Windows não foi determinada.

O ensaio `smoke_clinical_full_recovery_homolog.py` concluiu com código zero; log local ignorado `.data/audit-full-recovery-nov09.log`:

- **Backup Windows real:** backup-server.ps1 gerou manifesto, configuração, TLS e arquivos; reiniciou somente a API privada. Guardas recusaram produção e identificadores dos contêineres principais.
- **Banco/API HTTPS:** restauração preservou eventos administrativos e negação de leitura, contas originais, finalização/adendo e repetição idempotente. Exames antigos e novos conferidos byte a byte.
- **Chrome:** login restaurado, histórico clínico, texto original/adendo/contexto e edição do rascunho aprovados.
- **Após reinício:** edição do navegador e exame persistiram; origem permaneceu idêntica. Limpeza removeu bancos/contêineres privados, preservando banco/contêineres principais. Volumes fictícios e backup restrito retidos, sem conteúdo sensível no Git.

Esse aceite substitui o bloqueio operacional de 08/11 para esta versão. Não comprova o ambiente físico da clínica nem explica/corrige o vínculo Windows. Não é necessário repetir o CI de produto, já aprovado em `73b5b03`, por este fechamento documental. Próximo: publicar nova tag instalável, alinhar comandos dos guias e validar o avanço do checkout estável. Nenhuma tag nova nesta subetapa.
