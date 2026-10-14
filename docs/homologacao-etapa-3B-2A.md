# 3B.2A — vencimento inicial pelo dia clínico

Iniciada em 14/10/2026, base `0529f52`. **Em validação.** [Contrato](./plano-etapa-3B-2.md). R20 permanece aberto.

## Alteração

Novo utilitário `clinicDate` em `datetime.ts`, com instante injetável, usa `Intl.DateTimeFormat` e `America/Sao_Paulo` para obter data civil gregoriana ISO. O identificador do fuso fica centralizado no frontend. `onNewEntry` usa esse dia somente ao abrir um lançamento novo. Edição, escolha manual e rascunho não são recalculados; conversores de instantes, geração e atraso permanecem inalterados. Sem API/schema/dependências novos.

## Validação local

- Componente antes da correção: 1 falha/19 aprovações; às 23:59:59 da clínica o formulário sugeria o dia seguinte (`.data/tests-3b2a-before.log`).
- Após: 32 focados aprovados (`.data/tests-3b2a-focused.log`), incluindo fronteiras de dia/mês/ano, bissexto, offsets equivalentes e horário de verão histórico. Rascunho preservado após meia-noite, polling e atualização explícita de referências; nova ação recalcula; prova anterior de edição permanece aprovada.
- Suíte completa: 379 testes/43 arquivos, 75,28s (`.data/tests-3b2a-full.log`); TypeScript/Vite aprovado, build Vite 12,75s (`.data/build-3b2a.log`). Aviso preexistente de bundle acima de 500kB permanece.
- Backups originais `pre-3B-2A*` criados e preservados; `.data/upgrade_3b2a.py` somente `after` daqui em diante.

## Aceite integrado pendente

Ensaio `scripts/smoke_clinic_due_date_browser_homolog.py`: schema/API privados em `erp-dents-homolog`, Chrome São Paulo/UTC/Tóquio, relógio fixo apenas do navegador em janeiro de 2020 (após fim do horário de verão), sem mudar relógio do servidor. Critérios: padrão antes/depois da meia-noite, escolha preservada, reabertura e edição, seis criações explícitas com payload/resposta/releitura API iguais e nenhuma escrita automática. Relatório `.data/homolog/last-clinic-due-date-browser.json`.

Faltam aceite Chrome, auditorias, CI e atualização web/HTTPS/preservação/limpeza antes de concluir. O relógio do computador precisa estar correto; conversão de fuso não corrige relógio incorreto. Próximo após aceite: 3B.2B, geração por consulta no fuso clínico, mantendo vencimento explícito e idempotência.
