# U1.6D — formato de CPF e entrada sem perda silenciosa

Iniciada em 19/10/2026, base `92c33a4` (`piloto-cadastros-v0.1.7`). Subetapa de diagnóstico; nenhuma validação nova aplicada ao produto.

## Regra de negócio pendente

Pergunta enviada ao usuário: bloquear novas atribuições de CPF incompleto/com dígitos verificadores inválidos, ou apenas avisar e permitir salvar. Em ambas as opções, CPF ausente continua permitido e documentos antigos mantidos não impedem editar outros campos. Não presumir resposta nem confundir esta escolha com o bloqueio de duplicidade já aprovado.

## Reprodução

`scripts/diagnose_cpf_format_homolog.py` usa o bootstrap e o navegador em recursos privados de `erp-dents-homolog`, somente documentos fictícios. O script registra o comportamento da v0.1.7, incluindo defeitos; não é um teste de aceite do comportamento desejado para uma versão corrigida.

| Camada | Verificação |
| --- | --- |
| API | Criar com documento incompleto, misto, longo, sequência repetida e ausente; consultar o valor salvo; alterar somente notas; alterar CPF para texto misto |
| Banco | Consultas SQL no schema privado confirmam persistência dos formatos incompleto, misto e longo, exibindo somente resultado agregado |
| Chrome | Inserir texto completo no campo; observar remoção de letras e corte após 11 dígitos; salvar e consultar o CPF incompleto resultante |
| Isolamento | Schema/API/web temporários removidos pelo harness; volumes e ambiente principal preservados |

A entrada de texto completo via Playwright reproduz o evento de preenchimento, sem teste separado da área de transferência do Windows. Não afirmar teste de colagem física. O CPF de sequência repetida demonstra ausência de validação desse caso; não houve implementação ou teste exaustivo de algoritmo de dígitos verificadores.

## Critérios para a correção após a resposta

1. Aplicar a regra escolhida na API e no formulário para novos CPFs ou alterações efetivas, incluindo acesso direto à API.
2. Manter CPF ausente permitido e históricos inalterados editáveis; não regravar, excluir ou unir documentos antigos.
3. Não remover letras nem cortar excesso de dígitos silenciosamente. Mostrar o que foi informado para que a pessoa possa corrigir.
4. Preservar rascunho, controle de versão e proteção concorrente contra duplicidade, inclusive inativos.
5. Cobrir criação, edição, histórico, entrada completa, CPF ausente e erros com testes de componentes, banco, API e navegador. Atualizar roteiro/harness que usa documentos fictícios caso a validação passe a rejeitá-los.
6. Publicar nova versão de instalação somente após os aceites do pacote; P3 físico continua prioritário quando chegarem os dados do servidor.

## Resultado e retomada

Diagnóstico concluído em 19/10/2026: API, consultas SQL privadas e Chrome confirmaram os comportamentos da tabela. Reinício/fechamento do bootstrap também aprovados; recursos temporários removidos e volumes preservados. Evidência local ignorada: `.data/cpf-format-diagnosis-final.log`. A execução final terminou sem erro.

Primeira execução não informou a etapa por filtro de mensagens do harness; acrescentado somente o prefixo seguro do diagnóstico. A segunda localizou erro no roteiro: tentativa de abrir Novo ainda no painel inicial. Navegação para Pacientes corrigida antes da execução aprovada. Não houve falha de aplicação demonstrada por esses erros de roteiro.

**Retomada:** aguardar resposta à regra enviada e implementar os critérios acima. Scripts diagnósticos são específicos do comportamento v0.1.7: após corrigir a aplicação, preservá-los como reprodução histórica ou adaptá-los explicitamente, sem considerar a rejeição correta de documentos um defeito. Não houve alteração funcional, migração ou nova versão de instalação; os guias da v0.1.7 permanecem válidos.
