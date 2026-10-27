# 3B.4A — Contrato de instantes, omissão e null na API

## Resultado — 26/10/2026

Diagnóstico concluído sobre `618dc1a`, sem alteração do produto. A versão de instalação permanece **`piloto-cadastros-v0.1.22`**. O código atual da interface envia instantes com offset; os problemas abaixo foram provocados por requisições HTTP específicas, não pelo fluxo normal de cadastros do piloto.

`scripts/diagnose_datetime_contract_homolog.py` usa API/schema privados de `erp-dents-homolog`, dados fictícios e `PGTZ` somente na conexão dessa API temporária. Foram executadas as variantes `--db-zone UTC` e `--db-zone America/Sao_Paulo`. Nenhuma mudança de configuração, container principal ou volume do projeto.

## Matriz reproduzida

| Entrada | Resultado atual | Prova |
| --- | --- | --- |
| Criação sem início ou com início null | 422 | HTTP |
| Criação com um horário sem offset e outro com offset | 500 | HTTP |
| Edição com início null, fim null, status null ou um horário sem offset | 500 | HTTP; snapshot SQL da consulta e versão preservados |
| Edição omitindo início/fim | 200; mantém instantes e microssegundos | HTTP e comparação SQL explícita |
| Edição com notas null | 200; limpa notas e incrementa versão | HTTP |
| Criação às 10h–11h sem offset; conexão UTC | 201; valida disponibilidade clínica 10h–12h, mas persiste início às **07h de São Paulo** | HTTP e SQL `AT TIME ZONE` |
| Mesma criação sem offset; conexão São Paulo | 201; persiste início às **10h de São Paulo** | HTTP e SQL `AT TIME ZONE` |
| Filtros com Z, -03:00 e +09:00 equivalentes | Mesmo conjunto de consultas | HTTP nas duas conexões |
| Filtros sem offset | Aceitos; dependem do fuso da conexão e retornam conjuntos diferentes | HTTP nas duas conexões |
| Geração financeira paga com `paid_at` sem offset | Schema aceita; regra de negócio rejeita com 400 | HTTP; zero lançamentos no SQL |
| Geração pendente com `paid_at` sem offset | 201; descarta a data do pagamento | HTTP e contagem SQL |
| Repetição exata dessa geração pendente | Recupera mesmo lançamento/versão, sem duplicar | HTTP e SQL |

O banco preservou os registros nas edições recusadas. Bootstrap concorrente, reinício e limpeza dos recursos privados passaram. Logs locais ignorados: `.data/datetime-contract-UTC.log` e `.data/datetime-contract-Sao-Paulo.log`. A primeira hipótese de persistência sempre em UTC foi descartada: a reprodução mostrou dependência da conexão, motivo para testar os dois fusos explicitamente.

**Limite:** scripts de diagnóstico esperam os defeitos atuais. Não executá-los como aceite da correção; criar expectativas novas. Não houve teste de interface nesta subetapa, nem repetição do CI completo de produto, porque só foram adicionados diagnóstico e documentação. A última validação de produto permanece o [CI 40374303424](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/40374303424).

## Contrato para 3B.4B

1. **Agenda:** exigir instantes com fuso nos horários de criação/edição e nos limites de filtro. Rejeitar entradas sem offset antes de comparar ou persistir. Não adivinhar o fuso pelo computador ou conexão do banco.
2. **Atualização parcial:** omitir início/fim conserva o valor salvo; null explícito é inválido para início, fim, paciente, dentista e status. Notas null continua limpando o texto. Não reinterpretar silenciosamente null como omissão. Preservar a semântica atual de listas de procedimentos, tratada separadamente dos vínculos obrigatórios.
3. **Defesa no caso de uso:** validar tipos/fuso antes da comparação, incluindo chamadas internas fora do HTTP; retornar erro controlado, nunca TypeError/500. Não alterar globalmente `clinic_time`, que também atende convenções de registros históricos.
4. **Financeiro:** novas gerações com `paid_at` informado exigem offset, inclusive se pendentes. Omitido/null mantém o comportamento atual (horário atual quando pago, ausência quando pendente). Criação manual, edição e baixa já usam `AwareDatetime`; preservar essas proteções.
5. **Compatibilidade de recuperação:** `generate_from_appointment` consulta recibos antigos antes de decidir sobre nova gravação. Trocar simplesmente seu schema para `AwareDatetime` impediria repetir uma tentativa antiga sem offset e recuperar o lançamento original. Preservar exclusivamente a recuperação exata de recibo existente, sem nova escrita; recusar uma nova geração inválida após essa consulta. Testar chave/corpo divergentes e ausência de recibo.
6. **Dados existentes:** nenhuma migração, conversão automática de históricos ou alteração de versões durante rejeições. A tela v0.1.22 já manda offset, portanto não requer mudança coordenada dos formulários para este contrato.

## Aceites da correção

- Schemas/casos de uso: omissão, null, offset válido/ausente/misto, preservação de microssegundos, ordenação temporal e erro controlado.
- HTTP/SQL nas duas conexões: entradas inválidas não criam/alteram consultas; offsets equivalentes persistem o mesmo instante e filtram o mesmo conjunto. Preservar disponibilidade, concorrência e versões.
- Geração financeira: novo valor inválido não escreve; repetição exata de recibo antigo recupera o original; nenhuma duplicação de cobrança/pagamento.
- Regressões integradas de agenda e cadastros, CI, guias/tag de instalação se o produto mudar, commit/push e conferência do remoto.

R21 é mais amplo que datas: usuários, flags e demais campos obrigatórios precisam de matriz própria. Este diagnóstico não declara todo R21 resolvido. Após 3B.4, consolidar 3B.5 e seguir para o aceite operacional ampliado, sem reabrir exceções de autenticação. Instalação física continua prioritária quando chegarem os dados do servidor.
