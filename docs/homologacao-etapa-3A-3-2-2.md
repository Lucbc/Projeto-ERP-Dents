# Homologação 3A.3.2.2 — histórico financeiro e ações abertas

Início em 04/10/2026, base `9b5aee8`. [Contrato](./plano-etapa-3A-3.md). Em andamento; sem mudança de API, transação ou migração.

## Implementação

- Histórico aberto usa leitura cancelável 15s/60s, pausa oculto/offline e retorno/manual; fechamento elimina o cache sem consumidores. Estados e timestamp próprios identificam erro inicial e último histórico em falha transitória.
- 404 oculta histórico, referências e ações, interrompe leitura e exige fechar/revisar a lista. 401/403 limpam histórico; integrados à fronteira financeira, também desmontam conteúdo/cancelam/limpam demais consultas financeiras. Resposta tardia de janela fechada não contamina outra seleção.
- Histórico atualizado não substitui versão, pagamento, data, forma, motivo ou identidade da tentativa. Estado de referência da ação é identificado na interface; após conflito exige revisão. Resultado incerto mantém a mesma tentativa para recuperação explícita, sem escrita automática.
- Botão de histórico agora acessível a quem pode ler financeiro, independentemente de escrita/exclusão. Baixa/estorno mantêm permissões e regras existentes.

## Validação

| Camada | Evidência |
| --- | --- |
| Componentes/serviços | 14 testes novos: baixa/estorno remotos, snapshot/versão/pagamento, tentativa incerta idêntica, falha/60s/manual, 401/403/404, cancelamento/seleção/resposta tardia, pausa/retorno/sem sobreposição, sinal HTTP, leitura sem escrita e limpeza da página pela negação do histórico |
| Frontend | **208 testes/28 arquivos em 29,31s** aprovados; TypeScript/Vite aprovados (21,18s), aviso de bundle existente |
| Segurança local | npm/Python e seis imagens aprovados, sem achados; imagem web construída |
| Chrome | Aprovado: sessões independentes, pagamento remoto em **15287ms**, estorno remoto com motivo preservado, versões/pagamento/data/forma capturados e dois conflitos 409 reais; falha/recuperação, pausa oculto/fechado, leitura sem escrita, exclusão/404 e revogação/403 reais. Duas escritas explícitas, nenhuma automática. Capturas claro/escuro inspecionadas |
| Regressão Chrome histórica | Aprovada: respostas perdidas de baixa/estorno recuperam um evento; rascunho antigo rejeitado; estorno/correção/nova baixa mantêm histórico e tentativas atrasadas |
| API/banco/CI | Pendentes CI completo e smoke após atualização; não atribuir testes backend anteriores a este recorte |
| Preservação | Cópias públicas/exames/fingerprints/dump integral `pre-3A-3-2-2*` salvos; revisão final pendente |

Primeiro foco: 31/32 passaram. Seletor do novo teste atingia botão visual em vez do select nativo da forma de pagamento; fixture corrigida, suíte completa aprovada. Não contar a tentativa inicial como aceite. Erro esperado do teste que exige provider continua capturado pela suíte existente.

Ensaios intermediários do novo harness Chrome foram corrigidos: janela existente não tem role dialog, usando heading para localizar; revogação de escrita suspende controles pelo guard existente, então a prova do perfil de leitura fecha as ações e entra novamente na página para revisão explícita. Asserção de limpeza do componente também reforçada para heading real; **18 testes da página em 3,18s** aprovados após esse ajuste exclusivo de teste. Código da aplicação permanece igual ao commit `ab3ac8b`.

## Retomada

Implementação `ab3ac8b` publicada, **CI `37177193633` em andamento**. Validações locais encerradas; aguardar CI, depois atualizar somente web principal, verificar HTTPS/build servido, smoke e preservação com `.data/upgrade_3a322.py after`. Não repetir `before/full` nem sobrescrever backups. Todos os dados de teste são fictícios em `erp-dents-homolog`; logs/capturas ignorados em `.data`. Não remover volumes. Ajustes posteriores exclusivos de seletores dos testes/harness foram validados localmente e publicados com `[skip ci]`; código da aplicação do CI permanece idêntico.

Somente após aceite fechar 3A.3.2.2/3A.3.2. Próximo recorte: 3A.3.3, pacientes, conforme contrato; R19 continua parcial. Chrome no mesmo PC não prova capacidade ou estações físicas.
