# Homologação 3A.3.7.4B — geração por consulta

Em validação em 13/10/2026, base `bbea754`. [Contrato](./plano-etapa-3A-3-7-4.md). Sem API/schema.

## Mudanças

- Consulta preparada por abertura da geração; removida a leitura ociosa e o cache compartilhado. Janela renovada pelo leitor já validado, com AbortSignal.
- Opções estáveis até atualização explícita, que conserva seleção/notas/datas. Consulta cancelada ou fora da janela não é substituída automaticamente; nova geração fica bloqueada até revisão.
- Carregamento, erro, negação e lista vazia explícitos. Fechar/desmontar cancela a preparação; respostas tardias não entram na próxima ação. Nova abertura após cancelamento começa com formulário limpo.
- Tentativa incerta continua bloqueando edição/fechamento/atualização; recuperação usa variáveis e chave originais, inclusive sem acesso à lista. Nenhuma leitura gera escrita automática.

## Validação em andamento

24 testes focados aprovados (35,00s): seis novos cenários de geração, mais regressões de atualização financeira. Cobrem ausência de leitura ociosa, opções estáveis, atualização explícita, seleção ausente, 503/403/concessão, resposta tardia, suspensão e recuperação incerta com payload/chave idênticos após perda de acesso. Ensaio antigo agora aguarda preparação e exige zero leitura ociosa de consultas. Build TypeScript/Vite aprovado (27,13s); npm/Python aprovados.

Suíte completa, imagem/Chrome/regressões/CI e atualização da homologação ainda pendentes. Provas de componente simulam serviços; não substituem API/banco/Chrome.

Backups `pre-3A-3-7-4B*` preservados; helper `.data/upgrade_3a374b.py` somente `after`. Sem volumes removidos. Logs locais ignorados `.data/tests-3a374b-focused.log`, `.data/tests-3a374b-full.log`, `.data/build-3a374b.log`, `.data/docker-build-3a374b.log`, `.data/audit-dependencies-3a374b.log`.

## Retomada

Concluir aceites locais/CI, atualizar somente web de `erp-dents-homolog`, conferir HTTPS/dez verificações/preservação/revisão e zero schemas privados. Não repetir backups. Encerrar e publicar somente após os critérios; depois matriz final R19 em 3A.3.7.5. Instalação assistida permanece na etapa 5.
