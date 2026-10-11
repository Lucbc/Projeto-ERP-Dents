# Etapa 3A.3.7.2 — especialidades no formulário de dentistas

Concluída em 11/10/2026, implementação `dbaaa00`, base `ca48fd2`. [Contrato e recortes](./plano-etapa-3A-3-7.md). Sem alteração de API/schema.

## Implementação

- Cada criação/edição prepara especialidades atuais; nenhuma leitura ociosa ou atualização automática das opções durante o rascunho. Atualização explícita conserva nome, especialidade, horários e versão capturada.
- Especialidade é texto histórico: nome ausente permanece selecionado e identificado como fora do cadastro atual. Inativas são identificadas. Não há troca automática nem nova regra de integridade no servidor.
- Erro e negação têm mensagens próprias e bloqueiam envio até recuperação. Permissão de especialidades permanece independente da de dentistas.
- Protocolo de referências extraído para hook compartilhado com usuários, preservando cancelamento e proteção contra respostas tardias. Paginação de especialidades recebe AbortSignal e não aceita resultado parcial.
- Revisão de disponibilidade e bloqueio de alterações que afetem consultas futuras permanecem; atualizar opções não libera conflito nem renova versão.

## Validação e retomada

- Sete novos testes de referências e regressões de disponibilidade aprovados no ensaio focado (12 testes). Testes antigos ajustados para esperar preparação antes de preencher/salvar, sem remover provas de conflitos e horários.
- Auditorias npm/Python aprovadas; imagem web construída e seis imagens sem achados. Backups `pre-3A-3-7-2*` preservados; helper local somente `after`.
- Suíte completa: 302 testes/37 arquivos (47,77s), TypeScript/Vite aprovado (22,67s). Aviso preexistente de bundle acima de 500kB permanece. Chrome de referências e regressões de disponibilidade/atualização aprovados; capturas inspecionadas. [CI 38179819243](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/38179819243) aprovado: 302 backend/302 frontend, HTTP/builds/auditorias e seis imagens sem achados.
- Somente web da homologação atualizada após aceites locais, enquanto CI rodava isolado; HTTPS e assets idênticos ao build aprovado, dez verificações integradas e comparação de linhas/referências/bytes de exames aprovados. Revisão 0024/zero schemas privados, nenhum volume removido. Fechamento aguardou CI.
- Chrome confirmou 409 real com versão capturada, 403 real independente e concessão, ausência de polling das opções, cancelamento tardio, especialidade histórica e rascunho/horários preservados. Regressão de disponibilidade confirmou bloqueio até cancelar consulta e revisar referências com sucesso; regressão de atualização confirmou conflitos/remoção/acesso. Testes de componente não são apresentados como provas de banco ou interface.
- Logs e capturas ficam em `.data` ignorada, com fixtures exclusivamente fictícias em schemas privados de `erp-dents-homolog`. Nenhuma credencial publicada.

Próximo após aceite: 3A.3.7.3, referências em agenda/calendário. R19 parcial; instalação assistida na etapa 5.

Evidências locais ignoradas: `.data/tests-3a372-full.log`, `.data/build-3a372-final.log`, `.data/browser-3a372.log`, `.data/browser-availability-3a372.log`, `.data/browser-refresh-3a372.log`, `.data/audit-images-3a372.log`, `.data/smoke-main-3a372.log`, `.data/preservation-3a372.log`, `.data/ci-final-3a372.log`. Chrome no mesmo PC não comprova capacidade/estações físicas/outros navegadores.
