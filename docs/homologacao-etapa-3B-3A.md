# 3B.3A — preservar horários ao editar consultas

## Problema e correção

24/10/2026, base `10776a5`, correção `daf0b9f`. Os campos de data/hora trabalham com minutos, mas os horários salvos podem conter segundos e microssegundos. Antes, editar somente uma observação pela lista ou pelo calendário reenviava ambos os horários truncados.

Os dois editores passam a capturar o registro original junto com sua versão. Se o texto do horário não mudou, o conversor devolve a string original, sem passar novamente por `Date`. Se mudou, converte o novo valor. Início e fim são tratados separadamente; uma lista atualizada em segundo plano não substitui a versão/horários do rascunho. Criação e demais consumidores do conversor mantêm o comportamento anterior quando não recebem original.

## Validação

- `.data/appointment-precision-before.log`: dois testes novos falharam antes da correção, mostrando perda de segundos/frações nos dois editores; dois testes anteriores passaram.
- `.data/appointment-precision-components.log`: 26 testes focados aprovados. Incluem preservação de string com offset/microssegundos, mudança explícita de início e fim, conflito/revisão, referências, duração e versão capturada.
- `.data/appointment-precision-build.log`: imagem web construída, incluindo TypeScript e build.
- `.data/appointment-precision-browser.log`: Chrome real em São Paulo/UTC/Tóquio, lista e calendário. Seis edições de observação preservam ambos os instantes na API e SQL; seis alterações explícitas do fim preservam o início, persistem o novo fim e incrementam a versão. Data fixa apenas na navegação do navegador, dados fictícios históricos em schema privado. Não foi alterado o relógio do servidor.
- Recursos temporários removidos ao concluir; dados e volumes originais preservados.

## Bloqueio do CI e dependências

CI inicial `40062411068` recusou o pacote npm antes dos testes por [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). A versão corrigida publicada é Zod 4.6.6 ou superior. Atualização para Zod 4.6.7 e adaptador `@hookform/resolvers` 5.9.2; lockfile preserva versões exatas. Usar a API v4, sem recorrer à compatibilidade v3 apenas para ocultar o alerta.

A tipagem de entrada/saída de agenda e financeiro foi separada conforme [guia Zod](https://zod.dev/v4/changelog) e [adaptador oficial](https://github.com/react-hook-form/resolvers). Defaults de procedimentos e coerção de valores financeiros continuam no schema. Código `06fba16`: build e auditoria npm aprovados, 429 testes em 48 arquivos (157,28 s, `.data/appointment-precision-frontend.log`), nova imagem construída (`.data/appointment-precision-zod-image.log`). Repetição dos 12 envios de agenda aprovada (`.data/appointment-precision-browser-final.log`) e percurso de cadastros aprovado (`.data/appointment-precision-registration.log`), incluindo CPF/nascimento, busca, conflitos e preservação/limpeza de RG no PostgreSQL.

**Pendência:** [CI final 40062809549](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/40062809549) em andamento. Não liberar a tag antes do aceite final. Configuração inicial normal aprovada em Chrome/API/SQL com a nova biblioteca (`.data/appointment-precision-bootstrap.log`): login automático, um administrador, uma sessão, zero pacientes, configuração fechada após repetição/reinício e limpeza dos recursos privados.

## Correção das imagens — 25/10/2026

CI `40062809549` aprovou 328 testes backend (695,10 s), 429 frontend, builds e regressões HTTP, mas recusou uma ocorrência HIGH em web/gateway/edge/clamav. Auditoria local reproduziu CVE-2026-111497 em `brotli-libs` 1.2.0-r1; API/banco sem achados. [Correção oficial Brotli 1.2.1](https://github.com/google/brotli/releases/tag/v1.2.1). Fixar `brotli-libs=1.2.1-r0` nas três receitas afetadas, cobrindo as quatro imagens, sem mudar entrypoints, configuração ou volumes.

Build, auditoria das seis imagens, percurso de cadastros e CI da correção pendentes. Instalação liberada ainda v0.1.19; guias v0.1.20 são preparação local, sem tag. Esta pendência substitui a espera pelo CI anterior.

## Inventário para 3B.3B

| Consumidor | Trabalho que permanece |
| --- | --- |
| `datetime.ts` | Conversão entre instante e horário clínico, validação de horário inexistente/ambíguo histórico; manter preservação do original |
| Lista de consultas | Entrada, duração sugerida, comparação, exibição e filtros de dia completo usam hoje o fuso do computador |
| Calendário | `dateFnsLocalizer`, objetos Date, posição/seleção de eventos, dia/semana/mês, hoje e janela de leitura precisam de solução coerente |
| Painel/Consulta/exclusão | Padronizar exibição no mesmo fuso dos editores |
| Financeiro | Conversores de pagamento e edição, descrição de opções, histórico/pagamentos/estornos/snapshots, janela de referências de seis meses |
| Exames/estado de atualização | Formatação compartilhada de instantes; verificar efeitos antes de alterar o utilitário |

**Próximo 3B.3B:** reproduzir ida/volta, duração, filtros e seleção visual nos três fusos; implementar conjunto coerente, sem corrigir somente textos e deixar formulários/calendário em outro horário. R20 segue aberto; R21/offset da API mantém etapa própria. A validação desta subetapa prova preservação, não independência de fuso dos horários exibidos/editados.

## Instalação

Sem API, schema, migração ou configuração nova. Frente à v0.1.19, mudar web/gateway/edge/clamav; o roteiro geral continua reconstruindo seis imagens para cobrir versões antigas. Instalação física e ensaio operacional de atualização não executados nesta subetapa. Manter liberação restrita ao piloto de cadastros; tag v0.1.20 somente após todos os aceites.
