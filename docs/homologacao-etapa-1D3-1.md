# Etapa 1D.3.1 — erros e recuperação

Base: `ab27cad`. Implementação publicada em `131ed9a`. Ambiente exclusivo: `erp-dents-homolog`, dados fictícios. Validação local e remota concluída em 17/09/2026 (horário de São Paulo).

**GitHub Actions aprovado:** [execução 35298005705](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35298005705), commit `131ed9a7b5db2e08c5fcd24619858ef1018f2d9f`, job em **6min53s**. Suíte final de **87 testes backend e 38 frontend**, smokes HTTP (incluindo os novos erros reais), builds, auditorias de pacotes e das cinco imagens aprovados. As cinco imagens retornaram zero achados na consulta. Fechamento posterior somente documental, sem alteração de código testado.

## Mudanças

- Falhas de infraestrutura passam por uma fronteira HTTP que devolve mensagens controladas. Duplicidade e vínculos retornam 409; dados incompatíveis com restrições conhecidas, 422; indisponibilidade de conexão/pool, 503; falta de espaço, 507; demais falhas, 500. Não se converte todo erro de programação em indisponibilidade.
- Cada resposta recebe uma referência gerada no servidor e `Cache-Control: no-store`. Falhas inesperadas incluem a referência no JSON; os logs desse handler registram referência, classe da falha e padrão da rota, sem exceção bruta, SQL, parâmetros, corpo ou URL com dados. CORS continua aplicado às respostas de erro.
- Falha depois do início de um download interrompe a conexão, sem tentar enviar um segundo documento JSON. A exceção propagada é sanitizada. Não se confirma sucesso em uma transferência incompleta.
- Respostas de validação mantêm campo/tipo e mensagem segura, mas removem `input` e `ctx`, que podiam devolver senha ou texto clínico rejeitado.
- A dependência de banco faz rollback explícito em falhas e fecha a sessão. Parâmetros SQL são ocultados na representação de erros SQLAlchemy. PostgreSQL usa logs resumidos, sem statement, parâmetros de erro ou detalhes de linhas. Isso não apaga logs antigos nem constitui uma trilha de auditoria clínica.
- Exceções de domínio e registro de handlers têm uma definição canônica; os inicializadores reexportam a mesma identidade. Outros módulos duplicados de R33 continuam pendentes.
- Exclusão de procedimento em uso: o ORM deixa o PostgreSQL aplicar a FK existente, em vez de tentar anular a chave primária do vínculo e gerar AssertionError. Não há alteração de esquema, exclusão em cascata ou remoção de histórico.
- A interface identifica campos inválidos em 422, evita mostrar mensagens técnicas 5xx e informa a referência. Não repete gravações automaticamente: se o resultado de um commit for incerto, orienta conferir o registro antes de tentar de novo.
- Agenda diferencia carregamento, falha e resultado vazio; permite recarregar e bloqueia nova consulta enquanto a listagem estiver em erro. Falha nos cadastros do formulário tem recuperação sem limpar o preenchimento.
- Notificação antiga não apaga uma mais recente. Avisos têm semântica de status/alerta. Corrigidas as strings corrompidas da descrição da API e do aviso de permissões.

## Validação

- Frontend: **38 testes aprovados**, incluindo erro/recuperação da agenda, 422, respostas de proxy e disputa entre temporizadores. TypeScript/Vite e Nginx aprovados; aviso anterior de bundle acima de 500 kB permanece.
- Testes novos de API verificam classificação, CORS, referência não controlada pelo cliente, no-store, privacidade das respostas/logs do handler, identidade das exceções, conexão PostgreSQL realmente indisponível e interrupção de streaming.
- Smoke HTTP: duplicidade real de especialidade, gravação posterior ao erro, validação com conteúdo fictício privado e exclusão de procedimento referenciado; registros preservados. O ensaio ocorre em schema/API descartáveis, sem alterar os dados principais.
- Backend: **87 testes distintos aprovados localmente** — suíte de 86 e, após incluir o cenário de streaming, seis testes focados (cinco repetidos + um novo). O ajuste final de exclusão do ORM foi verificado novamente pelo smoke HTTP com PostgreSQL real. O CI executou os 87 juntos na versão final, todos aprovados.
- Smoke de erros: **dez grupos aprovados**, incluindo preparação/limpeza do ambiente isolado; fluxo geral: **dez grupos aprovados**, com cadastro, agenda, financeiro e bytes de exame. A verificação de privacidade confirmou ausência do marcador fictício de cadastro duplicado nos logs novos da API e do PostgreSQL.
- Atualização principal: cópias locais `.data/homolog/pre-1D3-1.dump` e `pre-1D3-1-exams.tar`; fingerprints das tabelas de negócio e hashes dos arquivos coincidiram antes/depois. Banco permanece em `0011_exam_file_deletions`, sem nova migração. Volumes preservados.
- A sessão do roteiro pré-atualização expirou durante a interrupção entre mensagens do usuário. Confirmada a expiração prevista; um novo login com as mesmas credenciais e o logout passaram. Não foi necessário redefinir senha ou segredo.
- Chrome: API de homologação parada brevemente, agenda mostrou falha e desabilitou criação; API religada e recuperação pelo botão confirmada sem novo login. Formulário recuperou cadastros preservando texto fictício preenchido. Não houve gravação desse formulário. Falha de procedimentos passou a ter mensagem distinta de lista vazia, com teste automatizado.

## Operação

Ao receber erro, conferir os dados antes de repetir uma gravação. Em falhas internas, enviar a referência exibida ao responsável pelo sistema; ela permite localizar classe e rota da falha sem pedir senha ou dados do paciente. O handler não registra stack trace com variáveis; investigação aprofundada deve reproduzir o problema com dados fictícios. Serviços locais foram religados ao final. As cópias desta entrega ainda não equivalem ao ensaio completo de restauração previsto na etapa 5.

```powershell
./scripts/homolog.ps1 -Action up
python scripts/smoke_errors_homolog.py
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 -e RUN_CLAMAV_TESTS=1 api python -m unittest discover -s tests -v
npm test --prefix apps/web -- --maxWorkers=1
```

Smokes HTTP compartilham a porta 18001 e devem rodar sequencialmente. Não imprimir configuração resolvida do Compose, tokens ou conteúdo de requisições. Logs de acesso/proxy e auditoria clínica têm políticas próprias; não se deve interpretar a sanitização deste handler como revisão integral de todos os logs externos.

## Sessão no navegador — decisão e próxima entrega

**O token continua em localStorage nesta entrega.** Revogação e isolamento de cache já existentes permanecem, mas não impedem um script da mesma origem de ler esse token. O tratamento de erro desta entrega não resolve esse risco.

A direção escolhida para **1D.3.2** é cookie de sessão `HttpOnly`, com `Secure`, política `SameSite` e proteção CSRF. A migração deve retirar o token acessível a JavaScript, tratar sessões antigas e preservar login/logout, expiração, recuperação de conexão e sincronização entre abas. Exige uma decisão explícita de origem/proxy e transporte: `Secure` não deve ser desativado para viabilizar HTTP em uma rede de produção. A preparação mínima de HTTPS pode precisar ser antecipada da etapa 5; o instalador e a recuperação assistida continuam naquela etapa.

Esse recorte separado evita misturar alterações de autenticação/transporte com correções de erro. A 1D.3 inteira permanece aberta. Também ficam para interação/usabilidade os modais, proteção contra descarte de formulário e revisão geral de estados das demais telas; R37 está parcialmente tratado, não encerrado integralmente.

Referências: [OWASP sobre armazenamento de identificadores de sessão](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html), [OWASP sobre cookies e transporte](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [Starlette — middleware/CORS](https://www.starlette.io/middleware/) e [SQLAlchemy — exclusão passiva e restrições do banco](https://docs.sqlalchemy.org/en/20/orm/cascades.html).
