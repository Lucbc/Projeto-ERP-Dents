# Homologação 3A.3.7.4A — referências do lançamento manual

Em validação em 12/10/2026, base `38ab51a`. [Contrato e recortes](./plano-etapa-3A-3-7-4.md). Sem alteração de API/schema; geração permanece em 3A.3.7.4B.

## Implementação

- Filtros têm opções próprias; criação/edição prepara pacientes, dentistas e consultas novamente, com cancelamento. Atualização explícita mantém campos/versão; cache e polling operacional não substituem essas opções.
- Referências opcionais sem permissão não impedem lançamento sem vínculo. IDs capturados fora da lista continuam visíveis e preservados; novas associações indisponíveis bloqueiam envio até atualização ou remoção explícita. Negação remove cópias não autorizadas dos filtros.
- Janela de consultas renovada por preparação, seis meses antes/depois, sem canceladas; ausência na janela não é exclusão do histórico. Geração ainda usa seu leitor anterior.
- Recarga explícita de conflito usa AbortSignal e identidade da ação; resposta tardia após desmontagem não reabre formulário. Atualizar referências não libera conflito de versão.
- Tentativa paga incerta repete valores/chave originais com formulário e atualização de referências bloqueados. Tentativa pendente incerta mantém obrigação de conferir lançamentos; pagamentos/estornos e snapshots históricos preservados.

## Evidências locais

- Nove testes novos de componentes/transporte e quatro de versão aprovados (13 testes, 11,76s). Incluem janela/sinal, ausência de acesso, IDs no payload, filtros independentes, falha parcial/concessão, cancelamento/desmontagem, conflito persistente e barreira global. Testes antigos agora aguardam preparação antes do envio; não removem provas de conflitos ou tentativas incertas.
- Chrome de referências aprovado: sessões independentes, opções por ação, estabilidade após mudança remota/polling/reconexão, atualização explícita, 503/recuperação, 403 real/concessão, consulta fora da janela preservada, 409 real com versão antiga e cancelamento tardio. Criação paga com resposta perdida recupera mesma chave/payload: uma cobrança e um pagamento, três requisições explícitas no ensaio. Capturas claro/escuro inspecionadas.
- npm/Python aprovados; seis imagens sem achados na primeira imagem. Backups públicos/completo/exames `pre-3A-3-7-4A*` e comparação original preservados; helper `.data/upgrade_3a374a.py` agora somente `after`.
- Suíte completa, build final, regressão Chrome de histórico/estorno, CI e atualização da homologação ainda em andamento. Ensaios locais de suíte sem progresso foram interrompidos; não contam como aprovação. Resultado final deve ser registrado antes do fechamento.

## Retomada de validação

Logs ignorados: `.data/tests-3a374a-complete.log`, `.data/tests-3a374a-new-final.log`, `.data/build-3a374a-final.log`, `.data/browser-3a374a.log`, `.data/browser-history-3a374a.log`, `.data/audit-dependencies-3a374a.log`, `.data/audit-images-3a374a.log`.

Concluir imagem final/regressões pertinentes/CI, depois somente web/HTTPS/dez verificações/preservação/revisão e zero schemas privados. Nenhum volume removido; fixtures exclusivamente fictícias em `erp-dents-homolog`. Não repetir backups. Esta etapa só será concluída após os aceites; R19 permanece parcial.
