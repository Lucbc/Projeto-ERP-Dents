# U1.6D — formato de CPF e entrada sem perda silenciosa

Iniciada e concluída em 19/10/2026, diagnóstico na base `92c33a4` (`piloto-cadastros-v0.1.7`). Implementação `5f23b8f` após confirmação da regra pelo usuário. Pacote aprovado: `piloto-cadastros-v0.1.8`. [CI 39257185004](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/39257185004) aprovado: 322 testes backend, 403 frontend, builds, regressões HTTP e auditorias. Log local `.data/cpf-validation-ci-final.log`.

## Regra de negócio confirmada em 19/10/2026

Usuário escolheu bloquear novas atribuições de CPF incompleto/com dígitos verificadores inválidos. CPF ausente continua permitido e documentos antigos mantidos não impedem editar outros campos. A validação confere formato e dígitos, sem consultar existência, titularidade ou situação cadastral em serviço externo. A regra de duplicidade incluindo inativos permanece.

## Implementação e validação concluídas

Validação na gravação pelo repositório, dentro do tratamento de transação; atualização compara o documento atual e a versão antes de validar alterações. Mesmo documento com apenas mudança de pontuação continua equivalente; documentos mistos diferentes não são confundidos. Recusa não grava notas, documento ou versão parcialmente. O formulário preserva entrada mista/longa, informa erro junto ao campo e mantém o rascunho; CPF em branco continua permitido.

11 testes focados de domínio/PostgreSQL aprovados, incluindo concorrência e históricos; 3 testes de domínio refeitos no container com caso adicional do primeiro dígito aprovados. Teste pelo Python do host não executou por dependência ausente; validação válida realizada no ambiente Docker do projeto. 17 testes de componente e build API/web aprovados; suíte frontend completa: **403 testes / 46 arquivos**, 133,52 s, `.data/cpf-validation-frontend.log`. Chrome/API aprovado com rejeição de formatos, ausência de corte silencioso, históricos, CPF ausente, duplicidade inativa, permissões e conflitos. Fixture histórica é criada por SQL somente no schema privado; falha inicial por timestamps ausentes corrigida no roteiro. Logs locais `.data/cpf-validation-db.log`, `.data/cpf-validation-unit-final.log`, `.data/cpf-validation-components.log`, `.data/cpf-validation-build.log`, `.data/cpf-validation-browser-final.log`. CI `39257185004` e ensaio de atualização aprovados; versão de instalação consolidada na v0.1.8.

## Ensaio do pacote e auditoria

Atualização `v0.1.7` → `5f23b8f` aprovada em **146,2 s** de manutenção, sem build/download. Backup restaurado e todas as tabelas comparadas; volumes/configuração/TLS/exame/sessão preservados. Documento misto criado na versão antiga permaneceu intacto e editável após atualizar. Novos documentos incompletos/mistos/longos/repetidos recusados; CPF ausente aceito, duplicidade protegida e novo login aprovado. Logs `.data/cpf-validation-update.log`, relatório `.data/install_532da935b9fa/result.json`.

API/HTTPS no ensaio de atualização; Chrome validado separadamente. Backup do harness, com rotina operacional Windows validada anteriormente. Sem migração, alteração de dependências ou configuração; proxies reconstruídos do mesmo código/runtime nas duas versões. Sem instalação física ou atualização do ambiente principal. Tempo local não prevê a janela na clínica. Auditoria local das seis imagens sem achados nesta execução: `.data/cpf-validation-runtime-audit.log`.

## Reprodução histórica do diagnóstico

`scripts/diagnose_cpf_format_homolog.py` usa o bootstrap e o navegador em recursos privados de `erp-dents-homolog`, somente documentos fictícios. O script registra o comportamento da v0.1.7, incluindo defeitos; não é um teste de aceite do comportamento desejado para uma versão corrigida.

| Camada | Verificação |
| --- | --- |
| API | Criar com documento incompleto, misto, longo, sequência repetida e ausente; consultar o valor salvo; alterar somente notas; alterar CPF para texto misto |
| Banco | Consultas SQL no schema privado confirmam persistência dos formatos incompleto, misto e longo, exibindo somente resultado agregado |
| Chrome | Inserir texto completo no campo; observar remoção de letras e corte após 11 dígitos; salvar e consultar o CPF incompleto resultante |
| Isolamento | Schema/API/web temporários removidos pelo harness; volumes e ambiente principal preservados |

A entrada de texto completo via Playwright reproduz o evento de preenchimento, sem teste separado da área de transferência do Windows. Não afirmar teste de colagem física. O CPF de sequência repetida demonstra ausência de validação desse caso; não houve implementação ou teste exaustivo de algoritmo de dígitos verificadores.

## Critérios de aceite da correção

1. Aplicar a regra escolhida na API e no formulário para novos CPFs ou alterações efetivas, incluindo acesso direto à API.
2. Manter CPF ausente permitido e históricos inalterados editáveis; não regravar, excluir ou unir documentos antigos.
3. Não remover letras nem cortar excesso de dígitos silenciosamente. Mostrar o que foi informado para que a pessoa possa corrigir.
4. Preservar rascunho, controle de versão e proteção concorrente contra duplicidade, inclusive inativos.
5. Cobrir criação, edição, histórico, entrada completa, CPF ausente e erros com testes de componentes, banco, API e navegador. Atualizar roteiro/harness que usa documentos fictícios caso a validação passe a rejeitá-los.
6. Publicar nova versão de instalação somente após os aceites do pacote; P3 físico continua prioritário quando chegarem os dados do servidor.

## Resultado e retomada

Diagnóstico concluído em 19/10/2026: API, consultas SQL privadas e Chrome confirmaram os comportamentos da tabela. Reinício/fechamento do bootstrap também aprovados; recursos temporários removidos e volumes preservados. Evidência local ignorada: `.data/cpf-format-diagnosis-final.log`. A execução final terminou sem erro.

Primeira execução não informou a etapa por filtro de mensagens do harness; acrescentado somente o prefixo seguro do diagnóstico. A segunda localizou erro no roteiro: tentativa de abrir Novo ainda no painel inicial. Navegação para Pacientes corrigida antes da execução aprovada. Não houve falha de aplicação demonstrada por esses erros de roteiro.

**Diagnóstico histórico:** scripts diagnósticos são específicos do comportamento v0.1.7; não executá-los como aceite da aplicação corrigida, pois a rejeição correta de documentos é esperada. A resposta já foi recebida e a implementação está registrada acima. **Retomada atual:** aceites concluídos e guias consolidados para v0.1.8; publicar commit/tag e conferir Git remoto ao encerrar. Próximo recorte: qualidade de datas de nascimento, mantendo prioridade da instalação física. Não repetir testes aprovados sem mudança. Sem migração nem alteração do ambiente principal.
