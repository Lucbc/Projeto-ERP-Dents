# Etapa 3B — datas civis e fuso da clínica

## Preparação 3B.P — 14/10/2026

Base `f9450df`, árvore inicialmente limpa. Início: inspecionar consumidores de datas, reproduzir divergências locais e delimitar correções de R20. **Preparação concluída; R20 continua aberto.** Nenhuma alteração funcional, migração ou atualização Docker nesta subetapa.

## Diagnóstico atual

| Área | Evidência no código atual | Consequência / alcance |
| --- | --- | --- |
| Nascimento | [datetime.ts](../apps/web/src/lib/datetime.ts), `formatDate`, usado por Pacientes e Consulta | Data civil interpretada como instante UTC; dia anterior em São Paulo |
| Vencimento manual | [financial-page.tsx](../apps/web/src/pages/financial/financial-page.tsx), `onNewEntry` usa `toISOString().slice(0, 10)` | Após 21h em São Paulo, sugere o dia seguinte; tabela usa outra conversão |
| Geração por consulta | [financial_use_cases.py](../apps/api/src/core/use_cases/financial_use_cases.py), `generate_from_appointment`: vencimento via `start_at.date()` e descrição via `strftime` | Depende do fuso do objeto recebido; converter ao fuso clínico antes de extrair data/hora. Ainda requer reprodução no caso de uso e banco |
| Atraso financeiro | [financial_repository.py](../apps/api/src/adapters/db/repositories/financial_repository.py): resumo e `is_overdue` usam `date.today()` | Depende do dia local do processo. Homologação define TZ São Paulo, mas a regra não explicita o fuso; não foi demonstrado erro no servidor atual |
| Agenda, consultas e horários | [datetime.ts](../apps/web/src/lib/datetime.ts), [appointments-page.tsx](../apps/web/src/pages/appointments/appointments-page.tsx), [calendar-page.tsx](../apps/web/src/pages/appointments/calendar-page.tsx) | Entrada, exibição, filtros e calendário dependem do fuso do computador; calendário usa `dateFnsLocalizer` e objetos Date locais |
| Demais instantes | Painel, Consulta, confirmação de exclusão, exames, pagamentos/estornos e snapshots financeiros | Exibições diretas ou `formatDateTime` usam fuso do computador; pagamento usa conversores de entrada compartilhados |
| Referências financeiras | [use-financial-references.ts](../apps/web/src/pages/financial/use-financial-references.ts) | Janela de ±6 meses calculada no fuso do computador; manter contrato por ação e recuperação idempotente |

A disponibilidade já usa `America/Sao_Paulo` em [availability.py](../apps/api/src/core/domain/availability.py). Há testes existentes de conversão UTC e de horários sem offset tratados como locais em [test_availability.py](../apps/api/tests/test_availability.py). Não substituir essa convenção silenciosamente. Os schemas de consultas ainda usam `datetime`; pagamentos já usam `AwareDatetime`. R21 exige auditoria própria de omissão/null/offset antes de mudar contratos.

## Reprodução executada

Node executou `formatDate`, `toInputDateTime` e `fromInputDateTime` reais de `datetime.ts`, transpiladas com o TypeScript instalado, no processo local com `TZ` selecionado a cada cenário. Apenas valores fictícios e fixos; nenhum acesso à API ou banco. O vencimento abaixo reproduz a expressão atual da tela, sem montar o formulário.

| Fuso do processo | `formatDate('2000-01-15')` | Entrada para instante `2030-01-08T01:30:00Z` | Envio de `2030-01-07T22:30` |
| --- | --- | --- | --- |
| America/Sao_Paulo | 14/01/2000 — incorreto | 2030-01-07T22:30 | 2030-01-08T01:30:00.000Z |
| UTC | 15/01/2000 | 2030-01-08T01:30 | 2030-01-07T22:30:00.000Z |
| Asia/Tokyo | 15/01/2000 | 2030-01-08T10:30 | 2030-01-07T13:30:00.000Z |

No instante fixo acima, o vencimento UTC resulta em `2030-01-08` nos três fusos, embora o dia clínico seja `2030-01-07`. Isso comprova divergência de utilitários/expressões; **não é teste de interface, API ou persistência**.

## Contrato proposto para implementação

- Data civil (nascimento/vencimento) mantém ano, mês e dia independentemente do computador, sem conversão para instante. Campo vazio continua com apresentação apropriada; definir tratamento de valor inválido sem normalizar datas impossíveis.
- Instantes conservam o momento salvo e usam o fuso clínico para apresentação e entrada. Adotar São Paulo, já usado na disponibilidade; configuração de múltiplas clínicas/fusos exige recorte próprio.
- “Hoje”, vencimento automático e atraso devem usar o mesmo dia clínico. Comparar vencimento estritamente anterior a hoje; vencimento hoje não está atrasado.
- Não reescrever datas/instantes históricos. Não converter simplesmente todos os valores com offset fixo `-03:00`: datas históricas podem envolver horário de verão.
- Preservar versão, rascunho, filtros, idempotência e snapshots. Alterar somente apresentação não deve provocar gravação nem modificar precisão de um instante inalterado.

## Subetapas e critérios de aceite

1. **3B.1 — datas civis na interface.** Criar separação explícita de formatação civil; corrigir nascimento em Pacientes/Consulta e padronizar exibição de vencimento. Testar datas de fim de mês, ano bissexto, ausência/inválido e independência de fuso. Componentes devem provar os consumidores; Chrome em São Paulo/UTC/Tóquio deve mostrar a mesma data fictícia. Não mudar conversores de instantes ou vencimento padrão nesta subetapa.
2. **3B.2 — dia clínico no financeiro.** Corrigir vencimento manual, geração/descrição por consulta e cálculo de atraso em recortes pequenos registrados antes de editar. Testar antes/depois da meia-noite clínica, mesmo instante com offsets diferentes, vencimento explícito preservado, hoje versus ontem. API/banco: geração idempotente sem duplicação e resumo/lista coerentes. Chrome: padrão correto com relógio controlado; preservar cobrança e histórico existentes.
3. **3B.3 — instantes, entradas e filtros.** Inventariar todos os consumidores compartilhados antes de alterar conversores. Garantir ida/volta no fuso clínico, filtros de dia completos, duração e precisão preservadas, horários históricos ambíguos/inexistentes tratados explicitamente. Separar calendário visual em recorte próprio se necessário; validar posição do evento, seleção/criação/edição, navegação de dia/semana/mês e retorno a hoje em três fusos. Não basta trocar o texto dos horários.
4. **3B.4 — contrato de offset/R21.** Reproduzir schemas/casos de uso atuais; diferenciar omissão, null e instante sem offset. Definir compatibilidade e rejeição controlada antes de mudar API; testes de erro de validação, nunca 500. Pagamentos já exigem offset: preservar essa correção. Não declarar todo R21 resolvido apenas com agenda.
5. **3B.5 — matriz final.** Consolidar evidências por data civil, dia clínico, instantes e consumidores; regressões de disponibilidade, concorrência e financeiro. Encerrar R20 somente após aceite dos recortes necessários e registro das limitações.

Em cada mudança funcional: testes focados reproduzindo o defeito, checks pertinentes, ensaio integrado isolado `erp-dents-homolog` com dados fictícios, CI conforme mudança, atualização/preservação quando aplicável, commit/push e verificação do remoto. Separar sempre componentes, Chrome, API e banco nos relatórios. Não repetir a homologação de 3A sem mudança ou regressão que a justifique.

## Validação desta preparação e retomada

Inspeção estática e reprodução Node concluídas. Documentação e links locais revisados. Nenhum teste novo de API, banco ou Chrome, nenhuma alteração de aplicação, backup, rebuild ou reinício. A homologação funcional vigente continua a [3A.3.7.5B](./homologacao-etapa-3A-3-7-5B.md).

**Próximo: iniciar 3B.1**, registrando início no plano geral. Criar teste que falhe com nascimento atual em São Paulo antes de corrigir; delimitar utilitário civil sem alterar `formatDateTime`, `toInputDateTime` ou `fromInputDateTime`. Preparar prova de Pacientes/Consulta/Financeiro em fusos diferentes e preservar dados. R20 permanece aberto; instalação assistida permanece na etapa 5.
