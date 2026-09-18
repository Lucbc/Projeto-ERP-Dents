# Etapa 2A.1 — concorrência de agenda

## Escopo e implementação

Base `968acd3`. Corrige R16: duas gravações podiam consultar o mesmo horário livre antes de qualquer commit e criar reservas sobrepostas. A reprodução em PostgreSQL isolado confirmou duas gravações aceitas sem as novas restrições.

Migração `0012_appointment_exclusion` adiciona:

- Exclusão GiST por dentista e por paciente, usando `tstzrange(start_at, end_at, '[)')`: horários consecutivos são permitidos, sobrepostos não.
- Cancelados ficam fora da exclusão; agendados, confirmados e concluídos continuam ocupando o intervalo, como na regra anterior da aplicação.
- Restrição `end_at > start_at`, inclusive para cancelados.
- Resposta HTTP 409 segura para violação de exclusão (`23P01`), sem SQL, horários ou identificadores de terceiros na mensagem.

A consulta prévia da aplicação permanece para informar conflitos usuais; o banco é a garantia final, inclusive para gravações diretas e processos diferentes. A restrição protege criação, reagendamento, mudança de paciente/dentista e reativação. Cancelamento/exclusão liberam o horário após commit. Uso de intervalos e `btree_gist` segue a [documentação PostgreSQL 16](https://www.postgresql.org/docs/16/rangetypes.html#RANGETYPES-CONSTRAINT) e a [extensão oficial](https://www.postgresql.org/docs/16/btree-gist.html).

## Atualização com dados existentes

A migração obtém bloqueio exclusivo da tabela durante a conferência e instalação. Se houver duração inválida ou sobreposição anterior, interrompe com mensagem sem dados clínicos e preserva os registros e a versão anterior. **Não cancela, move ou exclui consultas automaticamente.** Reserve uma janela para atualização; o tempo depende do tamanho da agenda.

O usuário de migração precisa poder instalar a extensão confiável `btree_gist`, disponível na imagem PostgreSQL utilizada. Ela é instalada no schema `public`; as classes de operadores são qualificadas, permitindo os schemas isolados de teste. O downgrade remove as três restrições, mas conserva a extensão compartilhada; não é correção para contornar conflito existente. Deploy utiliza Alembic, não `metadata.create_all`.

Em caso de bloqueio, identificar as consultas conflitantes no ambiente autorizado, resolver o cadastro com o responsável e repetir a migração. Faça cópias de banco/exames antes. Nunca remover volumes ou alterar o histórico automaticamente para permitir iniciar a API.

## Validações

- **11 testes PostgreSQL focados aprovados:** conexões separadas e barreira depois das duas verificações da aplicação; mesmo dentista, mesmo paciente, recursos independentes, horários consecutivos, edições simultâneas, reativação, cancelamento/exclusão, concluídos, offsets equivalentes, duração inválida, migração de dados válidos e recusa de conflitos antigos.
- **12 grupos HTTP aprovados** em API/schema descartáveis, incluindo bootstrap/limpeza e cinco grupos de agenda. Disputas retornam uma gravação aceita e outra 409; consulta final confirma zero pares ativos sobrepostos.
- **10 grupos do fluxo geral aprovados**, incluindo consulta/procedimentos, cobrança e exame.
- **Chrome/HTTPS:** formulário aberto antes de outro operador reservar o horário; envio recebeu 409 real, mensagem apareceu e datas/notas do rascunho foram preservadas. Captura local conferida. Fixtures removidas pela API ao terminar. Sem mudança no código frontend.
- **Atualização principal:** cópias `.data/homolog/pre-2A1.dump` e `pre-2A1-exams.tar`; fingerprints das tabelas de negócio e bytes dos exames coincidiram antes/depois. Migração em `0012_appointment_exclusion`, com três restrições presentes.
- **Suíte backend completa: 108 testes aprovados**, incluindo PostgreSQL e ClamAV. CI remoto: registrar resultado no fechamento antes de considerar a entrega concluída.

Comandos principais:

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 api python -m unittest discover -s tests -p test_appointment_concurrency.py -v
python scripts/smoke_agenda_homolog.py
node scripts/smoke_agenda_browser_homolog.cjs
```

O smoke de navegador requer Playwright local (`PLAYWRIGHT_MODULE` quando fora do caminho padrão), Chrome e a CA de homologação já confiável. Usa somente credenciais e registros fictícios; não imprime segredos. Não executar smokes que usam a porta 18001 ao mesmo tempo.

## Limites e próximo recorte

Esta entrega impede sobreposição; não implementa controle de versão para impedir perda de campos quando duas pessoas editam **a mesma consulta** (2B), nem atualização automática de telas entre computadores (3). A rolagem horizontal da lista de consultas observada no navegador permanece na revisão de interação/responsividade da etapa 3. Cobrança concorrente/idempotente continua pendente na **2A.2**, sem declarar toda a 2A concluída.
