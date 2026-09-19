# Etapa 2B.1 — edição simultânea de pacientes

Base `60347c6`. Primeiro recorte de R18: impedir que um formulário antigo de paciente sobrescreva a edição de outro operador. A etapa 2B completa continua em andamento.

## Contrato e implementação

- Migração `0014_patient_version` acrescenta `patients.version`, inteiro positivo, inicialmente 1. Os campos anteriores e `updated_at` não são alterados pela migração.
- Criação, consulta e listagem retornam a versão. `PUT /api/patients/{id}` exige `version` como inteiro positivo; ausente, nulo, booleano, texto ou número fracionário recebe 422. Não existe fallback que permita cliente antigo gravar sem versão.
- Repositório faz comparação e incremento em um único `UPDATE ... WHERE id = ... AND version = ... RETURNING ...`. O primeiro commit vence; a versão antiga recebe 409 sem alterar campos. Registro inexistente recebe 404. Mesmo envio sem mudança de campos consome uma versão, impedindo repetição silenciosa daquela edição.
- O frontend envia a versão do cadastro que originou o formulário, preservando-a mesmo se a lista for atualizada em segundo plano. Em conflito, mantém rascunho e oferece **Descartar rascunho e carregar atual**, com aviso explícito de substituição. Não tenta salvar automaticamente nem mesclar campos.
- Carregar depende de uma nova leitura bem-sucedida: falha de rede mantém o rascunho. Durante salvar/carregar, botões de confirmação/cancelamento e fechamento não iniciam outra operação no modal. Após carregar, o operador pode revisar e salvar com a nova versão.
- Ajustado smoke geral para enviar a versão. Testes de migração de agenda/cobrança usam seus repositórios/SQL históricos na reprodução anterior, evitando consultar uma coluna de pacientes que ainda não existia; os testes concorrentes da versão atual permanecem.

## Atualização

API e frontend precisam ser atualizados juntos. Uma aba com o frontend anterior recebe 422 ao tentar editar pacientes e precisa ser recarregada. Integrações devem obter `version` por leitura e devolvê-la no PUT; não buscar uma versão nova apenas para reenviar automaticamente um formulário antigo.

Antes da atualização da homologação, cópias locais `.data/homolog/pre-2B1.dump`, `pre-2B1-exams.tar` e fingerprints. Comparação exclui somente metadados de autenticação, versão de migração e a nova coluna de controle, mantendo todos os campos de negócio e bytes dos exames. Não publicar esses arquivos. Downgrade remove a proteção e a coluna; não deve ser usado para contornar conflitos.

## Validação

- **8 testes PostgreSQL focados aprovados:** dois rascunhos em conexões separadas, preservação de campos alterados por outro operador, recarga/revisão, reenvio e edição sem mudanças, precondições inválidas, inexistência, rollback sem consumir versão, versão em listagem e preservação na migração.
- **10 grupos HTTP aprovados**, incluindo bootstrap/limpeza, duas gravações concorrentes (200/409), versão obrigatória, recarga e exclusão anterior à edição.
- **43 testes frontend aprovados:** novo teste de componente verifica versão enviada, rascunho mantido em conflito e em falha de recarga, substituição apenas por ação explícita bem-sucedida e salvamento com a nova versão.
- Builds API/web aprovados; dez grupos HTTP do fluxo geral aprovados após atualização principal.
- Chrome/HTTPS: duas abas com a mesma versão; primeira edição salva, segunda recebe 409 e mantém rascunho. Recarga explícita exibe dados do primeiro operador, revisão salva versão 3. Capturas locais conferidas. Fixtures removidas.
- Homologação em `0014_patient_version`; fingerprints confirmaram campos de negócio anteriores e bytes dos exames preservados.
- Suíte backend completa: **127 testes aprovados**, incluindo PostgreSQL e ClamAV. CI remoto: registrar resultado antes de fechar.

Comandos específicos:

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 api python -m unittest discover -s tests -p test_patient_concurrency.py -v
python scripts/smoke_patient_concurrency_homolog.py
node scripts/smoke_patient_browser_homolog.cjs
```

O teste de navegador usa Chrome/Playwright (`PLAYWRIGHT_MODULE` se externo), HTTPS com CA confiável e duas abas com rascunhos independentes. Não há janela de aceite de segurança nesta etapa. Fixtures são fictícias e removidas ao terminar. Não executar APIs descartáveis simultaneamente na porta 18001.

## Limites e retomada

Proteção restrita à edição de pacientes pela API. Exclusões ainda não exigem versão; dentistas, procedimentos, especialidades, agenda, usuários/permissões e financeiro aguardam recortes próprios. Escritas SQL de manutenção que alterem pacientes devem também incrementar a versão; esta entrega não instala trigger para ferramentas externas.

Rascunho não persiste ao fechar/recarregar a página. Após resposta perdida, repetir uma edição salva recebe conflito: conferir o cadastro atual antes de editar novamente. Não há mesclagem automática ou histórico de alterações. Próximo recorte proposto: **2B.2 — controle de versão da edição da agenda**; histórico financeiro/baixa/estornos vêm separadamente.
