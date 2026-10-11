# Etapa 3A.3.6.2 — atualização de exames e identidade do paciente

Em homologação em 11/10/2026. Sem alteração de API/schema. [Escopo e aceite](./plano-etapa-3A-3-6.md).

## Implementação

- Lista de exames e cabeçalho atualizam independentemente com a política compartilhada de 15s/60s, pausa/retorno e indicação de falha/última leitura. A política de upload não recebe polling.
- Atualizações conservam arquivo/notas e identidade capturada na confirmação. Remoção remota encerra a confirmação do alvo e exige revisão explícita; polling não libera essa revisão.
- Perda de `patients.view` remove identidade e bloqueia exclusão, conservando exames autorizados. Concessão remonta apenas o cabeçalho. Perda de acesso aos exames ou paciente inexistente encerra o conteúdo e cancela operações.
- Remoção remota cancela bytes pendentes e libera prévias do exame. Barreira global cancela leituras de arquivos, mantendo rascunho oculto; revogação definitiva desmonta a área. Revogação de envio mantém o formulário desabilitado com o arquivo selecionado.

## Validação até aqui

- Componentes: 288 testes/35 arquivos aprovados (40,04s), incluindo 11 casos de leitura de exames e integração com a barreira real de permissões. Testes detectaram e corrigiram a assinatura de `isDirty` do formulário, necessária para conservar o input de arquivo após revogação de escrita.
- TypeScript/Vite aprovado (8,47s), imagem web construída, auditorias npm/Python aprovadas. Aviso existente de bundle acima de 500kB permanece.
- Backups `pre-3A-3-6-2*` preservados. Helper `.data/upgrade_3a362.py`: somente `after`; não repetir `before/full`.
- Chrome novo aprovado: upload remoto em 14899ms, rascunhos/snapshot preservados, prévia removida e revisão exigida após exclusão remota, falhas independentes, revogação/concessão real de permissões com 403 da API, barreira/recuperação/pausa e paciente removido com 404 real. Nenhuma escrita do leitor. Capturas claro/escuro inspecionadas.
- Auditoria local das seis imagens sem achados. Implementação `3ca5a2d` publicada; CI `38109842597` em execução.
- Regressão Chrome de isolamento/arquivos/exclusão aprovada: navegação A/B/A no mesmo documento, upload gravado antes de cancelar resposta, rascunho de B preservado e resultado consultado em A; download com bytes exatos, prévia, DELETE/download 404 reais em janela de leitura antiga controlada, recarga explícita/nova confirmação. Capturas inspecionadas. Scripts privados encerrados e limpos.

## Atualização e preservação

Somente web de `erp-dents-homolog` atualizada após aceites locais enquanto CI roda isolado; conclusão aguarda CI. HTTPS confiável retorna 200 e JS/CSS correspondem exatamente ao build validado. Dez verificações integradas passaram. Comparação antes/depois confirmou linhas de negócio, referências históricas e bytes de exames preservados; revisão `0024_user_version`, zero schemas `test_%`. Nenhum volume removido nem demais serviços reiniciados.

Um arquivo já baixado no computador não pode ser revogado pela aplicação. Cancelamento de upload não presume rollback no servidor; leitura posterior confirma o estado real. Chrome no mesmo PC não comprova capacidade, múltiplas estações físicas ou outros navegadores.

## Pendências e retomada

Retomar somente CI `38109842597`, ainda no backend/HTTP, e fechar/publicar documentos após aprovação. Todos os testes locais concluídos. Não repetir atualização, backups ou testes aprovados sem mudança/falha. Evidências locais ignoradas: `.data/browser-3a362.log`, `.data/browser-isolation-3a362.log`, `.data/audit-images-3a362.log`, `.data/smoke-main-3a362.log`, `.data/ci-watch-3a362.log`.

Próximo recorte após conclusão: 3A.3.7, referências e cobertura cruzada. R19 permanece parcial; Chrome no mesmo PC não comprova estações físicas, capacidade ou outros navegadores.
