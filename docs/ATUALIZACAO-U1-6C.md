# U1.6C — proteção de CPF na gravação

Iniciada em 18/10/2026, base `d54aab4`. Versão de instalação aprovada: `piloto-cadastros-v0.1.6`.

## Regra de negócio pendente

Perguntado ao usuário se o bloqueio de novas atribuições de CPF repetido deve incluir cadastros inativos (recomendado) ou somente ativos. A resposta altera também a regra de reativação; não implementar esse comportamento presumindo uma escolha.

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
3. Na edição, preservar o controle otimista por versão e excluir o próprio ID da comparação. Duplicidade histórica inalterada não deve impedir editar notas/contato. Se a política envolver apenas ativos, reativação exige a mesma proteção de gravação.
4. Responder com conflito específico `duplicate_cpf`, sem revelar dados de outro paciente. A interface deve preservar o rascunho e permitir corrigir o CPF; não confundir esse conflito com versão antiga nem exigir descartar todo o rascunho.
5. Reverter a transação em falhas, liberando travas. Verificar criação/criação, criação/edição, edição/edição, mesmo paciente/versão antiga, históricos duplicados, alteração de pontuação, CPF ausente e política de inativos.

Travas consultivas do PostgreSQL dependem de todos os gravadores seguirem o protocolo; não equivalem a uma restrição universal contra SQL externo ou uma versão antiga da API. Não misturar APIs antigas e novas escrevendo na atualização. Referências: [travas explícitas](https://www.postgresql.org/docs/16/explicit-locking.html) e [isolamento de transações](https://www.postgresql.org/docs/16/transaction-iso.html). O projeto já usa travas transacionais em operações financeiras; não há mudança de isolamento declarada no engine.

## Aceite antes de liberar

Testes PostgreSQL em schema privado com conexões independentes; resposta HTTP e permissões; componentes e Chrome cobrindo rascunho/correção; CI completo; atualização a partir de base com duplicados históricos preservados. Documentar limites e atualizar guias somente quando a nova versão estiver aprovada. Priorizar instalação física P3 quando chegarem os dados do computador.

## Ponto de retomada

Correção independente de preservação implementada e validada localmente; conferir CI do commit correspondente. Bloqueio de CPF ainda não implementado: aguardar resposta sobre incluir inativos, então executar o contrato acima. Nenhum novo tag de instalação nesta preparação; v0.1.6 preservada.
