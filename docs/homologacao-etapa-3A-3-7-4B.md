# Homologação 3A.3.7.4B — geração por consulta

Concluída em 13/10/2026, implementação `682e4e9`, complemento de fixture `a49fc83`, base `bbea754`. [Contrato](./plano-etapa-3A-3-7-4.md). Sem API/schema.

## Mudanças

- Consulta preparada por abertura da geração; removida a leitura ociosa e o cache compartilhado. Janela renovada pelo leitor já validado, com AbortSignal.
- Opções estáveis até atualização explícita, que conserva seleção/notas/datas. Consulta cancelada ou fora da janela não é substituída automaticamente; nova geração fica bloqueada até revisão.
- Carregamento, erro, negação e lista vazia explícitos. Fechar/desmontar cancela a preparação; respostas tardias não entram na próxima ação. Nova abertura após cancelamento começa com formulário limpo.
- Tentativa incerta continua bloqueando edição/fechamento/atualização; recuperação usa variáveis e chave originais, inclusive sem acesso à lista. Nenhuma leitura gera escrita automática.

## Validação

24 testes focados aprovados (35,00s): seis novos cenários de geração, mais regressões de atualização financeira. Cobrem ausência de leitura ociosa, opções estáveis, atualização explícita, seleção ausente, 503/403/concessão, resposta tardia, suspensão e recuperação incerta com payload/chave idênticos após perda de acesso. Ensaio antigo agora aguarda preparação e exige zero leitura ociosa de consultas. Build TypeScript/Vite aprovado (27,13s); npm/Python aprovados.

Suíte completa aprovada: 339 testes/41 arquivos (107,46s). Imagem web construída, seis imagens sem achados. Provas de componente simulam serviços; API/banco/Chrome têm evidências próprias abaixo.

Backups `pre-3A-3-7-4B*` preservados; helper `.data/upgrade_3a374b.py` somente `after`. Sem volumes removidos. Logs locais ignorados `.data/tests-3a374b-focused.log`, `.data/tests-3a374b-full.log`, `.data/build-3a374b.log`, `.data/docker-build-3a374b.log`, `.data/audit-dependencies-3a374b.log`.

## Retomada

Somente web de `erp-dents-homolog` atualizada após aceites locais; HTTPS/assets idênticos ao build, dez verificações integradas e preservação de linhas/referências/bytes de exames aprovados. Banco na revisão `0024_user_version`, zero schemas privados após limpeza. Backups originais e volumes preservados. Próximo: matriz final R19 em 3A.3.7.5; instalação assistida na etapa 5.

## Aceite final

- Chrome independente aprovado: nenhuma leitura ociosa de consultas; opções estáveis sob mudança remota/polling/reconexão, atualização explícita preserva notas/seleção; 503/recuperação, consulta fora da janela bloqueia nova geração, cancelamento/resposta tardia/reabertura. Capturas claro/escuro inspecionadas.
- Resposta de geração perdida após gravação real; consulta excluída e leitura da referência revogada (403 real). Repetição preserva chave/payload e recupera uma única cobrança: duas requisições explícitas. Log `.data/browser-3a374b-final.log`.
- Ensaio inicial falhou porque a fixture enviava `price` em vez de `price_cents`. Corrigido apenas o cadastro fictício em `a49fc83`, sem alteração da aplicação; a execução final acima é a evidência de aprovação. CI inicial `38400263636` cancelado/superado.
- Regressão Chrome de pagamentos/estornos/histórico aprovada: respostas perdidas recuperam um evento, rascunho antigo bloqueado e estorno/correção/novo pagamento preservam histórico e repetição atrasada. Log `.data/browser-history-3a374b.log`.
- [CI final 38400536916](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/38400536916) aprovado: 302 backend/339 frontend, HTTP/builds/auditorias; log `.data/ci-final-3a374b.log`.
- HTTPS `.data/https-3a374b.log`; dez verificações `.data/smoke-main-3a374b.log`; preservação `.data/preservation-3a374b.log`; imagens `.data/audit-images-3a374b.log`. Dados exclusivamente fictícios nos testes; nenhum volume removido. Chrome local não substitui ensaio em estações físicas.

Referências do financeiro concluídas; R19 permanece parcial até a matriz final.
