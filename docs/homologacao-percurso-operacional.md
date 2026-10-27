# Percurso operacional — recepção até pagamento

## Escopo — 27/10/2026

Base de produto `piloto-cadastros-v0.1.23` (`5906369`); início documental em `895ed2d`. Novo aceite integrado, sem alteração do produto, dependências, migrações ou procedimento de instalação.

Harnesses: [preparo e SQL](../scripts/smoke_operational_journey_homolog.py), [Chrome](../scripts/smoke_operational_journey_homolog.cjs). Usam API/schema e proxy HTTPS privados de `erp-dents-homolog`, dados exclusivamente fictícios, sem substituir containers principais nem remover volumes. Credenciais entram por stdin; falhas emitem apenas a etapa, sem corpos ou cabeçalhos HTTP.

## O que é preparo e o que é operação

- Preparo via API: administrador inicial, dentista com disponibilidade, procedimento de R$ 120, contas individuais de recepção/dentista e permissões restritas da recepção.
- Operação pela interface: recepção cria paciente sem CPF com nascimento/telefone, busca e reabre; agenda o mesmo paciente com dentista/procedimento e horário clínico 10h–11h.
- Outra sessão Chrome, em UTC: dentista encontra a consulta e abre os dados desse paciente. A recepção usa São Paulo. As sessões são distintas.
- Administrador autorizado ao financeiro gera a cobrança da mesma consulta, registra baixa integral e reabre o histórico. Não se trata de uma conta dedicada de caixa com permissões mínimas.
- Conferência adicional via API/SQL: vínculos, versões, valor, vencimento, instantes e ausência de duplicação. Nenhum paciente, consulta ou lançamento do percurso é criado diretamente em SQL.

## Critérios de aceite

| Camada | Prova |
| --- | --- |
| Interface | Cadastro, busca/reabertura, agendamento, acompanhamento pelo dentista, geração, baixa integral e histórico do mesmo paciente |
| Interface/permissão | Recepção sem acesso à página financeira |
| HTTP/permissão | Recepção recebe 403 em financeiro/usuários; dentista recebe 403 ao tentar gerar cobrança |
| HTTP | Cobrança vinculada ao paciente/consulta, R$ 120, vencimento na data da consulta, status pago; versão incrementada uma vez e paciente preservado; uma cobrança e um pagamento |
| SQL | Join paciente → consulta → lançamento → pagamento; nascimento preservado, versões 1/1/2, 13h–14h UTC equivalentes a 10h–11h de São Paulo, valor/vencimento/status corretos; contagem global de uma cobrança e um pagamento no schema privado |
| Ciclo do ambiente | Bootstrap, setup fechado após reinício, limpeza dos recursos temporários e preservação dos dados/volumes originais |

## Resultado

**Aprovado.** Primeira execução completa: `.data/operational-journey.log`. Versão final: `.data/operational-journey-final.log`, saída 0, incluindo horário 10h–11h na tela do dentista em UTC e cartão único de pagamento ativo com paciente/valor corretos. Bootstrap, reinício e limpeza também aprovados. Artefatos locais são ignorados pelo Git.

Na ampliação da verificação do histórico, o seletor genérico de nome encontrou tanto a descrição quanto o campo do paciente. Corrigido o seletor para o texto exato `Paciente: ...`, sem alteração do produto; percurso completo reexecutado e aprovado. Sintaxe JavaScript/Python, links locais e `git diff --check` verificados. CI completo não repetido: apenas harnesses/documentação mudaram; o código funcional mantém o CI aprovado em [3B.4B](./homologacao-etapa-3B-4B.md). Não foi gerada nova tag de instalação.

## Limites e próximo passo

Este aceite prova um percurso normal de cadastro/agendamento/acompanhamento/cobrança. Não prova evolução clínica, odontograma, prescrição ou prontuário completo; acompanhar uma consulta não equivale a realizar o atendimento clínico. Também não prova operação de caixa restrito, pagamentos parciais, revisão visual manual ou desempenho em computadores físicos diferentes. Casos de concorrência/recuperação têm provas próprias na [matriz 3B](./homologacao-etapa-3B-5.md).

Próximo: confrontar os requisitos de atendimento/prontuário do plano principal com as funcionalidades disponíveis e definir o percurso clínico realmente suportado antes de ampliar sua homologação. Não repetir a revisão de datas nem criar nova versão apenas por estes testes. Instalação física P3 tem prioridade quando chegarem os dados do Windows; liberação continua restrita aos cadastros, versão v0.1.23.
