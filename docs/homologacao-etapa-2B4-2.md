# Etapa 2B.4.2 — edição concorrente de especialidades

Base `8cb02a7`, iniciada em 21/09/2026. Critérios no [mapeamento dos catálogos](./plano-etapa-2B4.md). Implementação `c47ca18` publicada; complemento de correlação dos erros em validação remota antes do fechamento.

## Contrato entregue

- Migração `0018_specialty_version`: versão positiva, inicialmente 1; nomes, ativação e datas existentes preservados.
- Criação, leitura e lista retornam versão. PUT exige inteiro positivo estrito. Precondição ausente/inválida retorna 422; registro inexistente, 404.
- Comparação de versão, alteração de nome/ativação e incremento ocorrem no mesmo UPDATE. Edição antiga retorna 409 com `code: stale_version`. Campos omitidos permanecem intactos; uma atualização sem mudanças consome versão.
- Violação do índice único `ix_specialties_name`, na criação ou edição, retorna 409 com `code: specialty_name_exists` e mensagem para escolher outro nome. Rollback preserva todos os campos e a versão; a mesma versão pode ser enviada com o nome corrigido. Outros erros de integridade continuam usando seu tratamento próprio, sem serem classificados como duplicidade.
- `ConflictError` aceita código opcional. Respostas com código incluem também `request_id`, igual ao cabeçalho `X-Request-ID` gerado pelo servidor. Os conflitos de domínio anteriores mantêm o formato de resposta sem código; o novo contrato é aditivo.
- Frontend conserva rascunho e versão original. Só `stale_version` oferece **Descartar rascunho e carregar atual**. Nome duplicado permite corrigir e salvar sem recarga. Falha ao recarregar mantém nome/ativação; recarga bem-sucedida substitui explicitamente campos e versão. Salvar, recarregar, cancelar e fechar ficam coordenados enquanto há solicitação pendente.

Não há reenvio, mesclagem automática ou armazenamento persistente de rascunhos. A regra de unicidade continua a do índice existente; não foi alterada para ignorar maiúsculas ou acentos. Nomes continuam recebendo a remoção de espaços nas extremidades já existente.

## Preservação e atualização

Cópias locais anteriores: `.data/homolog/pre-2B4-2.dump`, `pre-2B4-2-exams.tar` e fingerprints. Nada disso deve ir ao Git. API e frontend atualizados juntos em **https://localhost:18443**, banco `0018_specialty_version`; recarregar abas antigas antes de editar especialidades.

Comparação após atualização e testes de navegador/fluxo geral confirmou dados de negócio e bytes de exames preservados. Apenas autenticação, revisão Alembic e nova coluna de versão de especialidades são excluídas da comparação. Nenhum volume removido. A migração exige janela para bloqueio da tabela; downgrade remove versões/proteção, sem restaurar valores anteriores. As cópias não substituem ensaio completo de restauração.

## Validação por camada

- **PostgreSQL:** dez testes focados aprovados. Duas versões iguais produzem um vencedor; nome/ativação correspondem ao vencedor. Dois registros disputando o mesmo nome geram uma alteração e um erro de duplicidade, preservando o perdedor. Duplicidade de criação/edição, correção com mesma versão, repetição, atualização parcial, versão inválida, exclusão anterior, rollback e restrição positiva verificados.
- **Migração e referências:** comparação do catálogo e dentistas antes/depois; renomear/inativar especialidade não altera o texto nem a versão dos dentistas.
- **API HTTP:** dez grupos aprovados, incluindo preparação/limpeza isoladas e três grupos específicos de especialidades. Contrato de versão, códigos distintos de erro, disputa, rollback, recarga/revisão parcial, lista e alvo excluído verificados. Fluxo geral: dez grupos aprovados.
- **Frontend:** 53 testes aprovados, incluindo quatro novos casos de especialidades: rascunho/recarga com falha, duplicidade na edição, 409 sem código conhecido e duplicidade na criação.
- **Chrome real com HTTPS:** duas abas no mesmo registro. Primeira recebeu duplicidade e corrigiu sem recarregar, mantendo versão 1; gravação válida gerou versão 2 e inativou. Segunda recebeu `stale_version` e manteve nome do rascunho/ativação antiga. Recarga trouxe nome atual e inativação; revisão salvou versão 3 sem reativar. Capturas conferidas, registros fictícios removidos e sessão encerrada.
- Builds Docker API/web aprovados. **Suíte backend completa local: 166 testes aprovados** em 345,120s, incluindo PostgreSQL e ClamAV. Zero schemas descartáveis. O [CI 35604768366](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35604768366) também aprovou esses 166 testes e o smoke de especialidades, mas encontrou a regressão de correlação descrita abaixo.

### Complemento de correlação dos erros

O smoke geral de erros exigia que a duplicidade de especialidade mantivesse `request_id` no corpo, igual ao cabeçalho. A tradução para erro de domínio preservou a mensagem segura, mas inicialmente perdeu esse campo. Corrigido compartilhando a referência do middleware no estado da requisição e incluindo-a nos conflitos com código. A referência continua sendo criada pelo servidor, sem aceitar o valor enviado pelo cliente.

Sete testes de tratamento de erros aprovados após a correção, incluindo um novo caso para os dois códigos, referência/cabeçalho, CORS, ausência de cache e formato legado. Os dez grupos do smoke geral de erros passaram sem alterar suas exigências. API da homologação atualizada; comparação de dados/exames continua idêntica, zero schemas descartáveis. Novo CI completo pendente; total esperado de backend passa a 167 pelo novo teste.

Comandos específicos:

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 api python -m unittest discover -s tests -p test_specialty_version.py -v
python scripts/smoke_specialty_version_homolog.py
node scripts/smoke_specialty_version_browser_homolog.cjs
```

O smoke HTTP usa API/schema descartáveis e porta 18001; executar sequencialmente com os demais smokes descartáveis. Chrome exige certificado confiável e `PLAYWRIGHT_MODULE` quando o módulo está fora do projeto. Credenciais e capturas permanecem locais.

## Limites e próximo recorte

`dentists.specialty` continua textual, sem vínculo por ID: renomear/inativar/excluir o catálogo não modifica os dentistas. Conversão dos vínculos e política de propagação exigem inventário e decisão próprios. Exclusões continuam sem versão; atualização automática entre computadores permanece na etapa 3.

Próximo recorte proposto: **2B.5 — financeiro**, começando pelo mapeamento de edição, baixa, cancelamento e exclusão, contratos de repetição e histórico/autoria (R18/R26). Definir uma primeira entrega pequena antes de migrar; preservar a geração idempotente da 2A.2. Esta etapa de especialidades não implementa histórico financeiro nem encerra toda a 2B.
