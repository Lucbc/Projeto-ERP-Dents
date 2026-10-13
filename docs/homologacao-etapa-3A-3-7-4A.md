# Homologação 3A.3.7.4A — referências do lançamento manual

Concluída em 13/10/2026, implementação `190592d`, base `38ab51a`. [Contrato e recortes](./plano-etapa-3A-3-7-4.md). Sem alteração de API/schema; geração permanece em 3A.3.7.4B.

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
- Suíte completa aprovada: 333 testes/40 arquivos, 88,22s; TypeScript/Vite 13,99s. Ensaios anteriores sem progresso foram interrompidos e não contam como aprovação. Chrome de referências repetido com sucesso na imagem final após limpeza de imports/tipagem; seis imagens finais sem achados. Histórico/estorno e atualização financeira aprovados, conforme aceite abaixo.

## Retomada de validação

Logs ignorados: `.data/tests-3a374a-complete.log`, `.data/tests-3a374a-new-final.log`, `.data/build-3a374a-final.log`, `.data/browser-3a374a.log`, `.data/browser-history-3a374a.log`, `.data/audit-dependencies-3a374a.log`, `.data/audit-images-3a374a.log`.

Imagem final/regressões/CI aprovados. Somente web atualizada; HTTPS/assets idênticos ao build, dez verificações integradas e comparação de todas as linhas/referências/bytes de exames aprovados. Revisão `0024_user_version`, zero schemas privados após limpeza. Nenhum volume removido; fixtures exclusivamente fictícias em `erp-dents-homolog`. Backups originais preservados; R19 permanece parcial.

## Aceite final

- [CI 38317724002](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/38317724002) aprovado: 302 backend/333 frontend, regressões HTTP, builds e auditorias. Log local `.data/ci-final-3a374a.log`.
- Chrome final de referências: `.data/browser-3a374a-final.log`; claro/escuro inspecionados. Testes de componente usam serviços simulados; Chrome confirma interface e respostas reais de API, com fixtures descartáveis.
- Regressão de pagamentos/estornos/histórico: respostas perdidas recuperam um único evento, rascunho antigo bloqueado, estorno/correção/novo pagamento mantêm histórico e repetição atrasada.
- Regressão de atualização financeira: sessões independentes, filtros/rascunho/versões preservados, mudanças remotas, conflitos, falha/recuperação/pausa e revogação. Log `.data/browser-refresh-3a374a.log`.
- Preservação: `.data/preservation-3a374a.log`; HTTPS `.data/https-3a374a.log`; dez verificações `.data/smoke-main-3a374a.log`; imagens `.data/audit-images-3a374a-final.log`. Nenhuma prova local de Chrome substitui teste em estações físicas.

Próximo: 3A.3.7.4B, geração por consulta. O leitor antigo da geração e sua janela/cache ainda não foram migrados; não considerar todo o financeiro encerrado.
