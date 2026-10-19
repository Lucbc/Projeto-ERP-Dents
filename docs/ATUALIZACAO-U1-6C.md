# U1.6C — proteção de CPF na gravação

Iniciada em 18/10/2026, base `d54aab4`; consolidada em 19/10/2026. Pacote aprovado: `piloto-cadastros-v0.1.7`, código final `005c28d`. [CI 39159743791](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/39159743791) aprovado: 318 testes backend, 400 frontend, builds, regressões HTTP e auditorias. Guias atualizados; instalação física permanece pendente do aceite no outro Windows.

## Regra de negócio confirmada em 18/10/2026

Usuário escolheu bloquear novas atribuições de CPF repetido incluindo cadastros inativos. Comparação de CPF completo com 11 dígitos, com/sem pontos, hífen e espaços. Documento ausente, incompleto ou misto continua fora dessa comparação; validação de formato/dígitos verificadores é recorte separado. Não considerar que essa proteção valida a existência ou autenticidade de um CPF.

CPF ausente e homônimos devem continuar permitidos. Não apagar, mesclar ou regravar documentos antigos automaticamente. A validação de dígitos verificadores não está implementada; não chamar documento de válido apenas porque tem 11 dígitos.

## Correção independente: preservar CPF histórico ao editar

O formulário aplicava `formatCpf` ao abrir edição: removia letras e cortava em 11 dígitos. Isso podia alterar documento histórico ao salvar somente outro campo. A edição agora recebe o valor armazenado diretamente, mantendo a máscara somente na digitação do campo. A normalização já existente de espaços externos no envio permanece.

- 15 testes de componentes aprovados, incluindo valor histórico fictício com letras/mais de 11 dígitos enviado intacto ao editar notas. `.data/cpf-preservation-components.log`.
- TypeScript/Vite/imagem web aprovados. `.data/cpf-preservation-build.log`.
- Ensaio Chrome/API aprovado: documento histórico preservado durante edição, conflito e reabertura; busca, aviso de duplicidade, permissões e cadastro sem CPF também aprovados. Recursos privados limpos, origem preservada. `.data/cpf-preservation-browser.log`.
- Sem alteração de API/banco, migração, atualização dos containers principais ou instalação clínica. Esta correção não implementa o bloqueio de duplicidades.

## Desenho técnico para a proteção

1. Canonicalizar CPF somente para comparação; nunca regravar documentos históricos em lote. Definir separadamente documentos incompletos/mistos e a política para alteração de CPF histórico.
2. Na criação ou mudança efetiva de CPF, adquirir trava transacional por schema/CPF antes de consultar duplicidade e gravar. Usar uma consulta separada depois da trava para enxergar a transação concorrente concluída em READ COMMITTED. Nenhuma trava deve permanecer aguardando interação do usuário.
3. Na edição, preservar o controle otimista por versão e excluir o próprio ID da comparação. Duplicidade histórica inalterada não deve impedir editar notas/contato. A política confirmada inclui inativos; manter o CPF ao reativar um registro histórico não representa nova atribuição.
4. Responder com conflito específico `duplicate_cpf`, sem revelar dados de outro paciente. A interface deve preservar o rascunho e permitir corrigir o CPF; não confundir esse conflito com versão antiga nem exigir descartar todo o rascunho.
5. Reverter a transação em falhas, liberando travas. Verificar criação/criação, criação/edição, edição/edição, mesmo paciente/versão antiga, históricos duplicados, alteração de pontuação, CPF ausente e política de inativos.

Travas consultivas do PostgreSQL dependem de todos os gravadores seguirem o protocolo; não equivalem a uma restrição universal contra SQL externo ou uma versão antiga da API. Não misturar APIs antigas e novas escrevendo na atualização. Referências: [travas explícitas](https://www.postgresql.org/docs/16/explicit-locking.html) e [isolamento de transações](https://www.postgresql.org/docs/16/transaction-iso.html). O projeto já usa travas transacionais em operações financeiras; não há mudança de isolamento declarada no engine.

## Aceite antes de liberar

Testes PostgreSQL em schema privado com conexões independentes; resposta HTTP e permissões; componentes e Chrome cobrindo rascunho/correção; CI completo; atualização a partir de base com duplicados históricos preservados. Documentar limites e atualizar guias somente quando a nova versão estiver aprovada. Priorizar instalação física P3 quando chegarem os dados do computador.

## Ponto de retomada

Correção independente `84a31a1` aprovada no CI `39135799815`. Proteção agora implementada com trava transacional por schema/CPF e consulta posterior, abrangendo criação e alteração efetiva de CPF. Registros históricos que mantêm o mesmo CPF (inclusive só mudando pontuação) continuam editáveis; CPF ausente permanece permitido. Conflito `duplicate_cpf` preserva o rascunho e permite corrigir/repetir sem descartar o formulário. Nenhum índice único, migração ou regravação histórica.

Sete testes PostgreSQL privados aprovados em 19,746 s: inativos, criação/edição sem alteração parcial, históricos, CPF ausente, concorrência criação/criação, criação/edição e edição/edição com espera de trava observada, rollback e versão antiga. Primeira execução identificou interpretação de um marcador SQL como parâmetro; corrigido antes da aprovação. Logs ignorados `.data/cpf-guard-db-final.log`. Dezesseis testes de componentes aprovados, incluindo correção de CPF após 409 com mesmo rascunho/versão; `.data/cpf-guard-components.log`. Build web/API aprovado, API reconstruída após ajuste SQL; `.data/cpf-guard-build.log` e `.data/cpf-guard-api-final-build.log`.

Chrome/API aprovado: CPF de inativo bloqueia criação/edição, sem gravação parcial; rascunho preservado, correção e nova tentativa aprovadas, documento histórico mantido até alteração explícita, permissões/buscas/paginação/conflito de versão aprovados. `.data/cpf-guard-browser.log`. Recursos privados limpos e origem preservada.

Regressão frontend local: **400 testes / 45 arquivos aprovados**, 137,68 s, `.data/cpf-guard-frontend.log`. Código funcional `5d43e8f`; `40e14bb` ajusta somente o parágrafo explicativo do aviso. CI `39157911163` aprovou testes funcionais, mas falhou na auditoria de imagens; correção e novo aceite descritos abaixo.

Ensaio de atualização `v0.1.6` → `5d43e8f` aprovado: **123,92 s** de manutenção, sem build/download. Backup privado restaurado com todas as tabelas comparadas; volumes, configuração, TLS, exame e sessão preservados. Dois cadastros fictícios com CPF equivalente (um inativo) criados na versão antiga continuam intactos; edição de outros dados mantendo CPF funciona. Novas duplicidades recusadas na criação/edição, sem mudança parcial; cadastro sem CPF e novo login aprovados. Log `.data/cpf-guard-update.log`, relatório `.data/install_91737bc72281/result.json`.

Limites: ensaio de atualização por API/HTTPS, navegador testado separadamente; backup do harness, rotina operacional Windows validada em etapa anterior. Proxies idênticos nas duas fases, sem mudança de dependências/esquema. A alteração posterior `40e14bb` é apenas texto, coberto pelo CI final; o ensaio de troca usa o código funcional `5d43e8f`. Recursos privados de homologação, volumes preservados, sem atualização dos containers principais nem instalação na clínica. Tempo local não dimensiona a janela do outro servidor.

Durante atualização, parar escritores antigos antes de iniciar API nova: SQL externo ou API antiga não participam da trava consultiva. Priorizar P3 quando chegarem os dados do computador.

## Auditoria das imagens — correção adicional

Os CIs `39157793381` e `39157911163` aprovaram testes funcionais (318 backend, 400 frontend), builds e regressões HTTP, mas falharam na auditoria de imagens. Reprodução local confirmou um achado HIGH e quatro MEDIUM em web/gateway/edge: libx11 1.8.13-r0 e libxpm 3.5.19-r0. API, banco e antivírus sem achados. Não houve supressão de alertas ou redução do critério de segurança.

`apk policy` confirmou correções no Alpine v3.24: libx11 1.8.14-r0 e libxpm 3.5.20-r0; [índice oficial libx11](https://pkgs.alpinelinux.org/package/v3.24/main/x86_64/libx11). Pins dos Dockerfiles web/proxies atualizados em `005c28d`. Build e auditoria local das seis imagens aprovados, nenhum achado nessa execução: `.data/cpf-guard-runtime-build.log`, `.data/cpf-guard-runtime-audit-final.log`. CI `39159743791` aprovado, incluindo auditoria das seis imagens; resultado conferido em 19/10/2026, log local `.data/cpf-guard-ci-final.log`.

Ensaio final `v0.1.6` → `005c28d` aprovado em **63,94 s**, agora com imagens antigas e novas dos proxies construídas e trocadas, além de API/web. Bibliotecas corrigidas conferidas dentro dos containers novos. Todos os aceites anteriores de backup, preservação, CPF, edição e login passaram novamente. Log `.data/cpf-guard-update-runtime.log`, relatório `.data/install_5194eea8f48d/result.json`. Mantêm-se os limites de API/HTTPS, recursos privados, backup do harness e ausência de instalação física. Esse ensaio substitui o anterior como aceite do pacote final.

## Próximo recorte: formato de documentos (pendente)

Leitura do código: `PatientCreateRequest`/`PatientUpdateRequest` recebem CPF como texto opcional; o caso de uso remove apenas espaços externos e converte vazio em ausente. O formulário aplica máscara na digitação, sem validar dígitos verificadores. A criação e a atualização de pacientes na aplicação passam pelo repositório protegido nesta entrega. Essa leitura não substitui testes de novos contratos.

Antes de impor formato, reproduzir API e interface com CPF incompleto/misto, colagem e documentos históricos; definir validação somente para novas atribuições, mantendo cadastro sem CPF e edição de outros campos de históricos. Evitar transformar/cortar silenciosamente um documento informado. Essa melhoria permanece pendente e não é pré-requisito da instalação do piloto.
