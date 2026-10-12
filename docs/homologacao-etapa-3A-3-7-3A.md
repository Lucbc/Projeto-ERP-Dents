# 3A.3.7.3A — referências da lista de consultas

Concluída em 12/10/2026, implementação `657407c`, complemento de testes `4b02691`, base `25695f3`. [Contrato e recortes](./plano-etapa-3A-3-7-3.md). Calendário permanece no recorte seguinte; sem alteração de API/schema.

## Implementação

- Leitores independentes para filtros/tabela e opções do formulário. Cada abertura prepara pacientes/dentistas/procedimentos atuais; não há polling dos catálogos nem substituição por invalidação/reconexão. Filtros têm atualização explícita e conservam IDs indisponíveis sem selecionar outra opção.
- Preparação conjunta com estado independente por recurso, bloqueio em falha parcial, erro/negação distintos de vazio e recuperação sem apagar o rascunho. Negação de referência no formulário também remove sua cópia da página; dados próprios da consulta respeitam autorização independente.
- Referências ausentes identificadas; procedimento ausente permanece visível e pode ser removido conscientemente. Envio exige vínculos presentes; inativos são identificados sem mudar regra do servidor.
- Duração automática responde a escolha de procedimento/início. Atualizar cadastros muda a sugestão, preserva fim automático/manual e exige ação para aplicar a nova duração. Datas, notas e versão capturada permanecem independentes da lista remota.
- Revisão específica de disponibilidade rejeita falha/cancelamento; atualização comum de opções não libera conflito. Recarga de versão tem sinal e guarda de montagem/ação para não iniciar novo formulário após desmontagem.
- Pacientes/procedimentos propagam AbortSignal entre páginas. Hook de referências reaproveitável pelo calendário; cancelamento e negação compartilhados sem cache global.

## Evidências e pendências

- 11 testes novos; suíte completa aprovada: 313 testes/38 arquivos (42,52s), TypeScript/Vite (13,25s). Testes antigos atualizados para aguardar preparação e distinguir leitura da página da leitura da ação, preservando provas de versão/disponibilidade. Aviso preexistente de bundle acima de 500kB permanece.
- npm/Python aprovados, imagem web construída, seis imagens sem achados. Chrome novo aprovado: duração remota sem substituir fim automático/manual, aplicação explícita, falha parcial/recuperação, permissão independente com 403 real/concessão, versão capturada com 409 real e preparação cancelada. Uma escrita explícita, capturas claro/escuro inspecionadas.
- Regressão Chrome de disponibilidade aprovada: alteração incompatível bloqueada até cancelar consulta, falha de atualização mantém bloqueio/rascunho e revisão bem-sucedida permite alteração compatível. Mensagem esperada adaptada ao novo estado específico de dentistas, mantendo as demais provas. Teste de recarga explícita reforçado para exigir sinal abortado ao desmontar; 11 testes finais aprovados (4,20s).
- Regressão Chrome da lista/calendário aprovada: criação remota observada em 15032/14979ms, oito leituras por cenário, pausa sem leituras, criação/reagendamento/cancelamento/exclusão e 503/recuperação sem substituir rascunho/versão ou escrever automaticamente. Capturas inspecionadas; não substitui a migração de referências do calendário, pendente no próximo recorte.
- [CI final 38198388765](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/38198388765) aprovado: 302 backend/313 frontend, regressões HTTP, builds e auditorias; seis imagens sem achados. CI inicial `38198259916` cancelado/superado após complemento de testes. Commits posteriores somente documentais.
- Atualizada somente web da homologação após aceites locais, enquanto CI rodava isolado; HTTPS/assets idênticos ao build, dez verificações integradas e comparação de linhas/referências/bytes de exames aprovados. Revisão `0024_user_version`, zero schemas temporários. Nenhum volume removido; fechamento aguardou CI aprovado.
- Backups locais `pre-3A-3-7-3A*` preservados. Helper `.data/upgrade_3a373a.py` somente `after`; não repetir `before/full`.
- Logs/capturas ignorados em `.data`; exclusivamente fixtures fictícias e schemas privados em `erp-dents-homolog`. Nenhuma credencial publicada.

Próximo após aceite: 3A.3.7.3B, calendário e suas três entradas. R19 parcial; instalação assistida na etapa 5. Chrome no mesmo PC não comprova capacidade/estações físicas/outros navegadores.

Evidências locais ignoradas: `.data/tests-3a373a-full.log`, `.data/tests-3a373a-final-focused.log`, `.data/build-3a373a-final.log`, `.data/browser-3a373a.log`, `.data/browser-availability-3a373a.log`, `.data/browser-agenda-3a373a.log`, `.data/audit-images-3a373a.log`, `.data/smoke-main-3a373a.log`, `.data/preservation-3a373a.log`, `.data/ci-final-3a373a.log`. Testes de componente/transporte simulado são distintos das provas Chrome/API/banco em homologação.
