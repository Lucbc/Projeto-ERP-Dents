# Homologação 2B.8.1 — leitura de permissões sem gravação

**Concluída em 26/09/2026**, base `3fef604`, implementação `2279001`. Sem migração, mudança visual ou alteração dos padrões de acesso.

## Correção

`PermissionUseCases.get_for_role` e a dependência `require_permission` normalizam somente a representação efetiva. Não criam uma linha ausente, não substituem JSON parcial e não confirmam a transação. A gravação continua exclusiva da alteração explícita de permissões. Administrador continua com acesso integral e matriz não editável.

Isso elimina a sobrescrita de uma revogação por uma leitura que já havia calculado a matriz antiga. Uma verificação que leu antes da revogação ainda pode terminar com aquele resultado; a próxima requisição observa a revogação. A etapa não promete cancelar retroativamente operações em andamento.

## Evidências e estado

- Seis testes permanentes em `test_permission_reads.py`: matrizes ausentes/parciais/canônicas em transação PostgreSQL somente leitura, ausência de commit inclusive sobre trabalho pendente, duas leituras simultâneas, revogação intercalada por conexão independente, escrita explícita e imutabilidade do administrador. Schema privado migrado, dados fictícios, limpeza registrada pelo fixture.
- Primeira execução identificou preparação incorreta de casos ausentes: as migrações já criam matrizes. Ajustado o fixture para remover somente as matrizes fictícias do próprio schema antes desses casos; não houve outra mudança funcional.
- HTTP autenticado aprovado em dez grupos pelo novo `smoke_permission_reads_homolog.py`, incluído no CI: GET geral/próprio e gates não criam linhas; JSON parcial e timestamps ficam intactos; revogação explícita persiste e a chamada seguinte recebe 403; usuário comum não altera matrizes e administrador permanece imutável. API/schema descartáveis removidos pelo harness.
- Build da API e seis testes finais aprovados em **22,051s**. Regressão 1C: **56 testes existentes aprovados** (usuários, sessões, autenticação, bootstrap e tratamento de erros). A execução inicial de 62 testes em 241,698s teve três falhas exclusivamente nos casos novos com fixture ausente incorreto; os seis novos foram repetidos após o ajuste, sem repetir os 56 aprovados. Sem teste visual novo: nenhuma mudança de interface. Atualização/preservação e CI concluídos abaixo.
- Cópias públicas/exames/fingerprints `pre-2B8-1*` salvas localmente pelo helper `.data/upgrade_2b81.py`. Nenhum segredo, dado local ou cópia entra no Git.

## Publicação e atualização

- Implementação `2279001` publicada, HEAD remoto conferido; [CI 36286375390](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/36286375390) aprovado em **14min49s**: **268 backend em 511,185s e 106 frontend**, builds, HTTP, dependências e seis imagens sem achados nessa execução. Regressão completa executada no CI, sem duplicação local.
- Dump completo salvo após limpeza dos schemas privados. API principal atualizada, dez verificações gerais aprovadas e HTTPS 200 com validação da CA local. Revisão `0022_dentist_user_restrict` mantida, nenhuma migração nova.
- Comparação integral confirmou todas as linhas de negócio/histórico e bytes dos exames preservados. Zero schemas descartáveis, nenhum volume removido. Web sem alteração. Acesso em **https://localhost:18443**.

## Próximo recorte

2B.8.2: versões por perfil, coordenação da autorização nas escritas e rascunhos independentes na interface, conforme [contrato](./plano-etapa-2B8.md). Formulários antigos ainda podem sobrescrever alterações explícitas até esse recorte. R18 permanece parcial; usuários/senha/exclusão ficam na 2B.8.3.
