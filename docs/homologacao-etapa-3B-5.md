# 3B.5 — Matriz final de datas e horários

Consolidada em 27/10/2026, base `5906369`, instalação `piloto-cadastros-v0.1.23`. Esta etapa revisa evidências existentes; não representa nova execução dos testes abaixo.

## Matriz de aceite

| Contrato | Componentes/domínio | API e banco | Interface real e referência |
| --- | --- | --- | --- |
| Nascimento e vencimento são datas civis | Calendário válido, bissexto, ausência/inválido e consumidores | Releitura API preserva datas/versões; não houve SQL específico nesse aceite | Pacientes, Consulta e Financeiro em São Paulo/UTC/Tóquio; editores preservados. [3B.1](./homologacao-etapa-3B-1.md) |
| Vencimento sugerido usa o dia clínico | Virada do dia, escolha explícita e edição | Seis criações com payload e releitura API | Relógio controlado em três fusos. [3B.2A](./homologacao-etapa-3B-2A.md) |
| Geração usa data e descrição clínicas | Instantes equivalentes, vencimento explícito, idempotência | API/PostgreSQL em três fusos, sem duplicação | Recuperação de resposta perdida em Chrome. [3B.2B](./homologacao-etapa-3B-2B.md) |
| Atraso usa hoje da clínica | Meia-noite, ano/bissexto, status e amostra única | Lista/detalhe/resumo, SQL confirma tabelas intactas | Seis cenários com 18 linhas em três fusos. [3B.2C](./homologacao-etapa-3B-2C.md) |
| Edição preserva o instante e sua precisão | Offset, segundos, microssegundos e intervalo positivo | Versões e limites conferidos em SQL | 12 edições em lista/calendário. [3B.3A](./homologacao-etapa-3B-3A.md), [integração](./homologacao-etapa-3B-3B-2.md) |
| Agenda usa São Paulo em qualquer estação | Conversores, duração, filtros, dias históricos de 23/25 horas, entradas ambíguas/inexistentes | Criações/reagendamentos e filtro inclusivo conferidos por HTTP/SQL | Quatro fusos: lista/editor, posição, seleção, navegação dia/semana/mês/Hoje e cancelamento. [3B.3B.2](./homologacao-etapa-3B-3B-2.md); regressão [3B.4B](./homologacao-etapa-3B-4B.md) |
| Consumidores compartilhados usam horário clínico | Painel, referências financeiras, exclusão e pagamentos nos testes frontend | Pagamento único com instante conferido em SQL | Pagamento/estorno e recuperação de resposta perdida em Chrome. Não houve ensaio visual individual de todos os leitores. [3B.3B.2](./homologacao-etapa-3B-3B-2.md) |
| API rejeita entradas inválidas sem perder compatibilidade | Null obrigatório, omissão, notas null, offset e chamadas internas | HTTP/SQL em UTC/São Paulo: erros controlados, ausência de escrita inválida, recibo histórico exato preservado | Regressões Chrome de agenda e cadastros aprovadas; casos inválidos são aceites de API. [3B.4B](./homologacao-etapa-3B-4B.md) |
| Disponibilidade, concorrência e financeiro continuam protegidos | Suíte backend integrada | CI executa agenda concorrente, disponibilidade/transações, versões e financeiro; SQL de sobreposição na retomada | Propagação entre sessões e recepção/dentista possuem aceites separados. [Retomada](./RETOMADA-OPERACIONAL.md), [workflow](../.github/workflows/verify.yml) |

## Decisão e limites

**3B concluída no escopo de datas e horários; R20 corrigido no escopo descrito na revisão original.** Os critérios foram associados às evidências acima. CI funcional mais recente: [40511579039](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/40511579039), commit `5406e90`, 493 testes frontend e 336 backend aprovados, regressões HTTP e seis imagens sem achados. Evidências antigas de navegador mantêm suas versões e não são apresentadas como reexecuções na v0.1.23.

- São Paulo é o fuso da clínica; múltiplas clínicas/fusos configuráveis não fazem parte deste aceite.
- Dias históricos e entradas ambíguas/inexistentes têm testes de utilitários/componentes. A cobertura visual ampliada de eventos históricos e multidia continua pendente; não é declarada aprovada pela cobertura do calendário cotidiano.
- Lista e resumo financeiro são requisições independentes e podem cruzar a meia-noite entre si.
- R21 foi tratado para instantes/obrigatórios de consultas e compatibilidade de geração. Outros campos/cadastros exigem inventário próprio; R21 não está encerrado globalmente.
- Não houve reescrita histórica, migração, rebuild, reinício, novo ensaio de atualização ou instalação física nesta consolidação. A liberação continua sendo o piloto de cadastros.

## Próximo aceite: percurso operacional completo

Executar um percurso com o **mesmo paciente fictício e a mesma consulta**, em recursos privados de `erp-dents-homolog`. Reaproveitar preparação/limpeza dos harnesses existentes, sem usar volumes de outro projeto e sem registrar credenciais ou conteúdo clínico.

1. Recepção com conta própria e permissões mínimas: criar paciente pela interface, localizar e reabrir o cadastro.
2. Criar consulta pela interface; outra sessão com conta do dentista deve encontrar paciente, horário e consulta corretos. Conferir o que cada perfil pode ler/alterar.
3. Usar uma conta autorizada ao financeiro para gerar lançamento dessa consulta pela interface, conferir vínculo, valor e vencimento, registrar pagamento e reabrir o histórico.
4. Conferir via API e SQL a identidade dos vínculos, horários, versões, valor e ausência de cobrança/pagamento duplicados. Não inferir persistência somente pela tela.
5. Registrar ações realmente feitas pela interface, preparo via API, verificações SQL e limites de permissões. Corrigir apenas bloqueadores demonstrados e repetir os cenários afetados.

O aceite não comprova prontuário/atendimento clínico completo e não amplia automaticamente a liberação de uso. Instalação física P3 tem prioridade quando houver dados do servidor. Backup e recuperação na clínica continuam obrigatórios conforme o roteiro existente.

## Validação desta entrega

Leitura cruzada dos relatórios, critérios originais R20/R21, testes de calendário e comandos do workflow. Links locais e `git diff --check` verificados. Nenhuma nova execução de componentes, API, SQL ou navegador: produto e testes permanecem inalterados. Sem nova tag de instalação; v0.1.23 preservada.
