# U1.9 — falhas de conexão no salvamento de pacientes

## U1.9A — diagnóstico concluído em 20/10/2026

Base `c988330`, versão de instalação `piloto-cadastros-v0.1.10`. Roteiro diagnóstico específico dessa versão; seus asserts descrevem problemas existentes e não são critérios de liberação de uma correção.

## Reprodução e impacto

- **Falha antes do envio:** interceptar o POST e interrompê-lo sem encaminhar ao servidor. O formulário mantém o rascunho e permite tentar novamente; nenhuma linha criada.
- **Resposta perdida após gravação:** encaminhar o POST real ao servidor, confirmar HTTP 201 e descartar apenas sua resposta. O formulário mantém o rascunho e permite reenviar. Repetir cria outro paciente sem CPF. Não equivale a duas pessoas diferentes com o mesmo nome: é a mesma tentativa de cadastro.
- **Envio iniciado offline:** o formulário fica em “Salvando...”, com Cancelar desabilitado; ao reconectar, envia sem novo clique.
- **Edição com resposta perdida:** alteração persistida, rascunho preservado e HTTP 409 ao reenviar a versão antiga. A consulta SQL confirmou exatamente uma edição, na versão 2; nenhuma sobrescrita pela tentativa repetida.

A mensagem genérica de rede orienta “tente novamente”, mas não distingue falha antes do envio de resposta perdida após gravação. CPF repetido não resolve pacientes sem CPF. Bloquear homônimos não é uma solução.

## Contrato para U1.9B — correção

1. Não enfileirar salvamentos de pacientes iniciados offline para execução automática posterior. Exibir orientação clara e manter rascunho utilizável.
2. Diferenciar resultado desconhecido de recusa confirmada. Não afirmar que nada foi salvo quando falta a resposta.
3. Proteger criação no servidor com identificador estável da tentativa: repetir a mesma tentativa deve recuperar o resultado, sem inserir outra linha. Alterar os dados com o mesmo identificador deve ser tratado explicitamente, sem sobrescrita.
4. Transação única para cadastro e comprovante da tentativa; verificar concorrência em conexões distintas, rollback, CPF ausente/repetido, permissões e isolamento entre usuários. Não armazenar documentos/rascunhos completos em logs ou comprovantes.
5. Manter controle de versão na edição. Após resposta perdida, permitir conferir o estado atual preservando o rascunho antes de decidir como prosseguir.
6. Não permitir que uma repetição recrie um registro excluído ou devolva dados sem autorização atual. Definir retenção e recuperação da tentativa antes da implementação.
7. Se houver nova tabela/migração, ensaiar atualização e restauração de backup com dados anteriores antes de publicar nova tag. Não alterar dados históricos automaticamente.

O financeiro já possui comprovantes duráveis de operações; é referência de implementação, não prova de que pacientes possuem a mesma proteção. A criação de pacientes ainda exige projeto e testes próprios.

## Evidências e retomada

Roteiros `scripts/diagnose_patient_network_homolog.py` e `.cjs`, Chrome/API/SQL privados de `erp-dents-homolog`, dados exclusivamente fictícios. Primeiro ensaio encontrou falha do roteiro na consulta sem cabeçalhos de sessão; corrigida antes do aceite. Ensaio final aprovado: `.data/patient-network-diagnosis-final.log` e relatório `.data/homolog/last-patient-network-diagnosis.json`. Chrome/API comprovou os quatro cenários; SQL confirmou duas criações após resposta perdida, uma criação após reconexão e uma edição na versão 2. Bootstrap, reinício e limpeza dos recursos privados aprovados; volumes e containers principais preservados. Trata-se de reprodução controlada, não de interrupção física da rede ou de teste de capacidade.

Sem alteração funcional, migração ou atualização dos containers principais. Versão de instalação permanece v0.1.10; orientação provisória na rotina de recepção e limites de liberação. Próximo: implementar U1.9B conforme critérios acima; transformar os cenários em testes de aceite da correção. Não executar o diagnóstico antigo esperando sucesso após corrigir os defeitos que ele reproduz. Instalação física P3 permanece prioritária quando chegarem os dados do servidor.
