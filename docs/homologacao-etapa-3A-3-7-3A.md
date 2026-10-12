# 3A.3.7.3A — referências da lista de consultas

Em validação em 12/10/2026, base `25695f3`. [Contrato e recortes](./plano-etapa-3A-3-7-3.md). Calendário permanece no recorte seguinte; sem alteração de API/schema.

## Implementação

- Leitores independentes para filtros/tabela e opções do formulário. Cada abertura prepara pacientes/dentistas/procedimentos atuais; não há polling dos catálogos nem substituição por invalidação/reconexão. Filtros têm atualização explícita e conservam IDs indisponíveis sem selecionar outra opção.
- Preparação conjunta com estado independente por recurso, bloqueio em falha parcial, erro/negação distintos de vazio e recuperação sem apagar o rascunho. Negação de referência no formulário também remove sua cópia da página; dados próprios da consulta respeitam autorização independente.
- Referências ausentes identificadas; procedimento ausente permanece visível e pode ser removido conscientemente. Envio exige vínculos presentes; inativos são identificados sem mudar regra do servidor.
- Duração automática responde a escolha de procedimento/início. Atualizar cadastros muda a sugestão, preserva fim automático/manual e exige ação para aplicar a nova duração. Datas, notas e versão capturada permanecem independentes da lista remota.
- Revisão específica de disponibilidade rejeita falha/cancelamento; atualização comum de opções não libera conflito. Recarga de versão tem sinal e guarda de montagem/ação para não iniciar novo formulário após desmontagem.
- Pacientes/procedimentos propagam AbortSignal entre páginas. Hook de referências reaproveitável pelo calendário; cancelamento e negação compartilhados sem cache global.

## Evidências e pendências

- 11 testes novos; suíte completa aprovada: 313 testes/38 arquivos (42,52s), TypeScript/Vite (13,25s). Testes antigos atualizados para aguardar preparação e distinguir leitura da página da leitura da ação, preservando provas de versão/disponibilidade. Aviso preexistente de bundle acima de 500kB permanece.
- npm/Python aprovados, imagem web construída. Chrome novo e auditoria das imagens em execução. Pendentes: regressões Chrome pertinentes, CI, atualização somente web/HTTPS/dez verificações/preservação/revisão/limpeza e fechamento. Etapa ainda não concluída.
- Backups locais `pre-3A-3-7-3A*` preservados. Helper `.data/upgrade_3a373a.py` somente `after`; não repetir `before/full`.
- Logs/capturas ignorados em `.data`; exclusivamente fixtures fictícias e schemas privados em `erp-dents-homolog`. Nenhuma credencial publicada.

Próximo após aceite: 3A.3.7.3B, calendário e suas três entradas. R19 parcial; instalação assistida na etapa 5. Chrome no mesmo PC não comprova capacidade/estações físicas/outros navegadores.
