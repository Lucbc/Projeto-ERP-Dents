# Etapa 2B.4.1 — edição concorrente de procedimentos

Base `6d656a3`. Primeiro recorte dos catálogos, conforme [mapeamento 2B.4](./plano-etapa-2B4.md). Especialidades terão entrega própria.

**Concluída em 21/09/2026.** Implementação `224d074`, prontidão `e8164a6` e imagem oficial `8c28719`. [CI 35601989322](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35601989322) aprovado em 11min16s: 156 testes backend, 49 frontend, regressão HTTP, builds e auditorias. O histórico abaixo registra as falhas anteriores e a correção validada.

## Contrato entregue

- Migração `0017_procedure_version`: versão positiva inicialmente 1, preservando campos e referências existentes.
- Criação/leitura/listagem retornam versão. PUT exige inteiro positivo estrito: precondição inválida ou ausente 422; versão antiga 409; inexistência 404. Atualizar frontend/API juntos e recarregar abas antigas.
- Nome, descrição, preço, duração e ativação são protegidos por comparação/incremento no mesmo UPDATE. Campos omitidos permanecem intactos; envio sem mudanças consome versão. Falha de gravação não consome versão nem altera parte do registro.
- Formulário conserva versão original e rascunho. Recarga explícita substitui os campos somente após leitura bem-sucedida; falha mantém o rascunho. Preço vazio, zero e centavos têm significados distintos preservados. Salvar/recarregar/cancelar/fechar ficam coordenados durante gravação/recarga.
- Exclusão permanece sem precondição de versão. Não há mesclagem, repetição automática ou armazenamento persistente do rascunho.

## Preservação

Cópias locais prévias `.data/homolog/pre-2B4-1.dump`, `pre-2B4-1-exams.tar` e fingerprints. Homologação atualizada em `https://localhost:18443`, banco `0017_procedure_version`. Comparação após migração e smokes confirmou todos os campos de negócio anteriores e bytes de exames; exclui autenticação, revisão Alembic e somente a nova coluna de versão de procedimentos. Nenhum volume removido.

A migração precisa de janela pelo bloqueio da tabela. Downgrade remove a proteção e seus números, sem restaurar valores anteriores. Cópias/segredos permanecem locais; não equivalem a ensaio completo de restauração.

## Validação

- **Nove testes PostgreSQL focados aprovados:** disputa com conexões separadas, conjunto vencedor de nome/preço/duração, ativação antiga, revisão parcial, preço/duração nulos e zero, repetição, validação, rollback, listagem, exclusão anterior e migração preservando catálogo/vínculos.
- Teste de integração também confirmou que editar preço/duração/nome mantém horários das consultas, referências e valores de cobranças já geradas; nova cobrança usa o preço atualizado.
- **49 testes frontend aprovados**, incluindo três novos cenários de recuperação com preço nulo, zero e centavos. Verificados rascunho, falha de recarga, conversão decimal e versão enviada após recarga.
- **Dez grupos HTTP específicos e dez gerais aprovados.** Builds Docker API/web aprovados.
- **Chrome/HTTPS:** duas abas abriram o mesmo procedimento. Uma gravou R$ 123,45/45 minutos; outra recebeu 409 e conservou R$ 234,56/60 minutos. Recarga recuperou o valor salvo; revisão gravou R$ 321,09 mantendo 45 minutos, versão 3. Capturas conferidas; fixtures removidas.
- Suíte backend completa: **156 testes aprovados**, incluindo PostgreSQL e ClamAV; zero schemas de teste restantes.
- Implementação `224d074` publicada; [CI 35507513580](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35507513580) aprovou frontend/builds e os testes novos de procedimentos, mas a suíte backend encerrou com uma falha no ClamAV real: definições carregadas fora do prazo permitido. A suíte local completa passou; novo CI depende do complemento abaixo.

### Complemento de prontidão do ClamAV

O healthcheck anterior conferia somente PING/PONG e podia liberar a API com definições antigas. Os três Compose agora verificam a data carregada, mantendo os limites da API (sete dias e tolerância futura de um dia). Rechecagem interna do banco de assinaturas reduzida de 600 para 60 segundos; healthcheck não força download nem relaxa a segurança. Os logs da execução anterior não permitem determinar por que a atualização/recarga remota não ocorreu a tempo; diagnóstico seguro incluído no CI.

ClamAV da homologação recriado com o mesmo volume. Passaram a checagem real, cenários de definições antigas/futuras/indisponíveis/malformadas e os cinco testes do scanner, incluindo PNG limpo e EICAR. LF do shell preservado por `.gitattributes`. Novo CI completo pendente; não considerar a etapa encerrada antes dele.

Em 21/09, o resultado do [CI 35508107940](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/35508107940) confirmou bloqueio da inicialização com definições `28122`, de 13/09, idade de 623625 segundos. O healthcheck impediu liberar a API, conforme esperado. A imagem anterior foi criada em 14/09; não foi determinada a causa externa da falta de atualização naquela execução.

Os três Compose foram atualizados para o digest oficial `a5f03c12a79dbe9f6d8a527b6bb1ea053fa8dd061d3738a26897f055ee2d9303`, criado em 21/09. Inspeção sem rede confirmou ClamAV 1.4.6, definições `28129` de 20/09 e assinatura digital válida. Após recriação local com o volume preservado, o serviço ficou saudável, carregou `28129` e passou novamente o smoke de prontidão e os cinco testes do scanner real. Trocar imagem não atualiza automaticamente volumes antigos; FreshClam e a política de idade continuam necessários. Validação remota completa ainda pendente.

Fechamento: o CI de `8c28719` aprovou a inicialização isolada, prontidão, scanner real, todos os testes backend/HTTP e auditoria. API, web, gateway, banco e ClamAV sem vulnerabilidades identificadas nas consultas local e remota. Isso não substitui atualizações futuras nem garante ausência de falhas desconhecidas. A atualização da imagem resolveu o bloqueio nesta execução; não demonstra a causa da falha do atualizador nas execuções anteriores.

Gateway remoto: 413/503, respostas JSON 408 em 30,010s e vagas liberadas; 80 chamadas de saúde com p95 de 0,0399s. Conferência local após recriação do antivírus confirmou novamente dados de negócio e bytes de exames preservados, zero schemas descartáveis. Não houve nova migração neste complemento.

Comandos específicos:

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 api python -m unittest discover -s tests -p test_procedure_version.py -v
python scripts/smoke_procedure_version_homolog.py
node scripts/smoke_procedure_version_browser_homolog.cjs
```

Chrome/Playwright requerem CA confiável e `PLAYWRIGHT_MODULE` quando instalado fora do projeto. Smokes com API descartável compartilham porta 18001 e devem ser sequenciais.

## Limites e próxima entrega

Esta proteção evita sobrescrita no cadastro, mas não define preço histórico nem leitura conjunta de preços durante geração de cobrança. Cobranças novas usam os preços atuais; valores existentes ficam armazenados no financeiro. Políticas de exclusão, histórico financeiro e atualização automática entre computadores continuam pendentes.

Próxima entrega: **2B.4.2 — edição concorrente de especialidades**, incluindo distinção entre nome duplicado e versão desatualizada. Vínculo por ID com dentistas e propagação de renomeação exigem recorte próprio; não atualizar textos em massa implicitamente.

README recebeu, por solicitação do usuário, os dois identificadores/perfis ativos encontrados na homologação local em 20/09/2026. Nenhuma senha, hash ou token foi consultado para essa lista ou publicado. É uma consulta pontual, não uma sincronização de contas entre servidores.
