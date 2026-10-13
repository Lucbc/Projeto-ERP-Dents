# 3A.3.7.5A — requisições durante navegação entre módulos

Iniciada em 13/10/2026, base `1dd5478`. [Critérios e matriz](./plano-etapa-3A-3-7-5.md). Validação integrada concluída; R19 permanece parcial.

## Ensaio

- Novo `scripts/smoke_navigation_reads_browser_homolog.py`/`.cjs`, reutilizando API/schema descartáveis do projeto `erp-dents-homolog` e imagem web já homologada. Duas sessões Chrome independentes; conta leitora de recepção, escritor administrador, fixtures exclusivamente fictícias.
- Navegação por links do menu, mantendo um marcador no documento: painel → pacientes → consultas → agenda → financeiro → painel. Janela de 32s por tela cobre dois intervalos nominais; a contagem distingue permissões, indicadores, listas/resumo e referências. Entradas de página são relatadas separadamente.
- Aceite por janela: somente categorias da tela ativa e permissão global, duas ou três leituras por categoria (a fase do timer global pode cruzar três disparos em 32s). Nenhuma leitura periódica das referências, dos módulos abandonados ou da geração fechada; nenhuma escrita do leitor.
- Retorno rápido ao painel com dado criado pela outra sessão; pausa de 32s por visibilidade e por offline, sem novas leituras; retorno com dados atuais. Visibilidade controlada por evento/estado no navegador, não prova de suspensão física do computador. Offline usa o contexto de rede do Playwright e evento do navegador.
- Visibilidade/foco combinados devem produzir uma leitura de cada indicador/permissão. Resposta de pacientes retida por 3s verifica deduplicação no foco e botão manual desabilitado, abaixo do timeout real de 15s. Sobreposição com intervalo longo continua coberta por timers controlados em `live-query.test.tsx`.
- Saída do ensaio contém apenas categorias fixas, contagens, duração e estágio. Não registra URL completa, filtros, headers, payloads ou credenciais. Wrapper compartilhado reconhece falhas deste ensaio e conserva suas medições seguras para diagnóstico.

## Validação por camada

- Sintaxe JavaScript (`node --check`) e Python (`ast.parse` dos dois arquivos) aprovadas.
- Sem alteração de frontend, backend, dependências ou schema. Testes de componentes existentes não foram repetidos. Nenhum rebuild, reinício, migração ou backup dos serviços principais necessário; migrações do harness aplicam-se somente ao schema temporário.
- Chrome/API: ensaio final aprovado contra HTTPS/API reais da imagem homologada, sem alteração de frontend/backend. A primeira versão usava espera de 17s para resposta lenta, acima do timeout de 15s; reduzida para 3s. As execuções seguintes aprovaram percurso/retorno rápido/pausas, mas falharam no trecho lento; dois ensaios focados passaram, inclusive após reconexão. Estágios mais precisos localizaram a espera no clique manual inicial, antes da medição. O ensaio final inicia a leitura lenta por foco e verifica o botão manual desabilitado durante a espera, preservando a prova de deduplicação. Nenhuma correção funcional atribuída a esse ajuste do harness. Logs intermediários `.data/browser-3a375a.log`, `.data/browser-3a375a-final.log`, `.data/browser-3a375a-complete.log`, `.data/browser-3a375a-slow.log`, `.data/browser-3a375a-slow-return.log`; log aprovado `.data/browser-3a375a-approved.log`; relatório estruturado `.data/homolog/last-navigation-reads-browser.json`, todos ignorados.
- Banco: wrapper confirmou migrações/fixtures apenas no schema descartável e limpeza final; conferência posterior confirmou revisão principal `0024_user_version` e zero schemas `test_%`. Nenhum volume removido. Imagem web do ensaio igual à do serviço principal; nenhum serviço principal reiniciado.
- CI completo não repetido neste recorte de ensaio/documentação: o workflow não executa estes scripts Chrome e aplicação/dependências permanecem idênticas à versão aprovada em `38400536916` (302 backend/339 frontend). Aceite novo sustentado pela execução direta do Chrome e verificações de sintaxe, links e diff; não é alegação de novo CI aprovado.

## Medições finais

| Fase | Duração (ms) | GETs por categoria |
| --- | ---: | --- |
| panel | 32013 | appointments: 2, dentists-count: 2, patients-count: 2, permissions: 2 |
| initial-Pacientes | 474 | patients-list: 1 |
| patients | 32010 | patients-list: 2, permissions: 2 |
| initial-Consultas | 454 | appointments: 1, dentists-reference: 1, patients-reference: 1, procedures-reference: 1 |
| appointments | 32014 | appointments: 2, permissions: 2 |
| initial-Agenda | 469 | appointments: 1, dentists-reference: 1 |
| calendar | 32013 | appointments: 2, permissions: 2 |
| initial-Financeiro | 558 | dentists-reference: 1, financial-list: 1, financial-summary: 1, patients-reference: 1 |
| financial | 32015 | financial-list: 2, financial-summary: 2, permissions: 2 |
| initial-Painel | 457 | appointments: 1, dentists-count: 1, patients-count: 1 |
| panel-return | 32012 | appointments: 2, dentists-count: 2, patients-count: 2, permissions: 3 |
| initial-Pacientes | 460 | patients-list: 1 |
| initial-Painel | 464 | appointments: 1, dentists-count: 1, patients-count: 1 |
| hidden | 32004 | 0 |
| hidden-return | 526 | appointments: 1, dentists-count: 1, patients-count: 1, permissions: 1 |
| offline | 32017 | 0 |
| offline-return | 517 | appointments: 1, dentists-count: 1, patients-count: 1, permissions: 1 |
| slow-shared-triggers | 3770 | appointments: 2, dentists-count: 2, patients-count: 1, permissions: 2 |

## Próximo passo

Próximo: 3A.3.7.5B: sessão revogada no percurso, nova identidade e consolidação final R19. Esta medição não é teste de carga, capacidade SQL, volume transferido, múltiplos computadores físicos ou outros navegadores. A instalação assistida continua na etapa 5.
