# Homologação 3A.3.1.2 — integração das permissões efetivas

Início em 03/10/2026, base `5067241`. [Contrato](./plano-etapa-3A-3.md). Ativação da fundação 3A.3.1.1; sem migração ou mudança de autorização no backend.

## Implementação

- Provider único por sessão acima da interface. `usePermissions` passa a consumir contexto; painel e consulta deixam de agendar permissões localmente. Leitura para todos os perfis, inclusive administrador; 15s/60s e visibilidade/conexão conforme política existente.
- Gate global mantém filhos montados sob `hidden`, `display:none`, `inert` e `aria-hidden` durante verificação indisponível. Foco vai para o aviso; conteúdo não fica navegável. Snapshot de apresentação permanece somente abaixo dessa barreira para que condições de formulários não apaguem rascunhos. Contexto de autoridade continua indicando falha sem conceder ações.
- Leituras periódicas de dados recebem suspensão pelo gate; leitor de permissões permanece ativo para recuperação. Requisições de dados em andamento são canceladas no cliente. Não há repetição automática de escritas. Cancelamento do cliente não é prova de rollback de operação já enviada.
- Revogação confirmada de leitura desmonta o conteúdo da rota e descarta cache do recurso (pacientes inclui cabeçalho `patient`). Negação global desmonta conteúdo e descarta caches de recursos; 401 continua encerrando sessão pelo transporte. Administrador não dispensa a leitura de permissões.
- Perda confirmada de escrita suspende ações da rota com `fieldset disabled` e bloqueio de submissão, preservando rascunhos e tentativas financeiras pendentes. Só permite retomar após recuperar as permissões anteriores e clicar explicitamente em revisar/retomar; leitura autorizada permanece. Aviso fica acima de modais. Permissão de estorno financeiro participa da revisão. Não desmontar a página nessa perda de escrita: isso descartaria uma chave de idempotência ainda necessária para recuperar uma resposta incerta.
- Perfil divergente chama revalidação de identidade sem expor conteúdo. A verificação não se sobrepõe enquanto pendente; mudança de identidade/perfil/vínculo descarta cache e reinicia o escopo do provider. Falha mantém barreira para tentativa posterior/manual.
- Guards de painel/consulta agora explicitam suas permissões de rota. Nenhum acesso clínico, regra de disponibilidade, versão, fingerprint ou idempotência foi ampliado.

## Validação

| Camada | Evidência |
| --- | --- |
| Componentes | Nove testes novos: formulário real de pacientes/versão preservados sob barreira, foco e invisibilidade, revogação/concessão de leitura/escrita, menu/rota/formulário com leitura única, 401/403 para administrador, divergência de perfil e verificação lenta sem sobreposição; baixa financeira incerta mantém mesma versão/chave após revogação e recuperação explícita |
| Regressão frontend | Versão final: 178 testes em 26 arquivos aprovados em 26,88s. Painel/consulta usam provider/gate reais; sessão, agenda e fluxos versionados incluídos |
| Build | TypeScript/Vite e imagem web aprovados; aviso existente de bundle >500kB permanece |
| Banco/API | Nenhuma mudança transacional ou migração. Verificação HTTP do navegador usa sessão real e schema privado; CI repetirá regressões existentes |
| Chrome | Fluxo final de permissões aprovado: uma leitura em 17s com menu/rota/formulário, barreira/foco/rascunho, suspensão e revisão explícita de escrita, leitura revogada/concedida, 403 HTTP e sessão administrativa revogada reais, nenhuma escrita automática. Painel/consulta/agenda também aprovados; revisar capturas finais sem transição de tema |
| Auditoria local | Seis imagens sem achados |
| Atualização/CI | Pendentes publicação/CI e atualização web principal com comparação de preservação |

Primeiro foco teve 62/63 testes aprovados: fixture do painel respondeu perfil admin após o teste trocar para recepção; corrigida fixture, regressão aprovada. Primeiras tentativas Chrome pararam no seletor de entrada no painel e na verificação HTTP sem identificador de sessão; ajustes no harness, não contados como aprovação. Acrescentada proteção/teste de revalidação de identidade lenta. Inspeção das capturas encontrou contraste insuficiente no aviso escuro, corrigido com cor semântica. Revisão do fluxo financeiro substituiu o descarte inicial de ações por suspensão e revisão explícita, preservando tentativas incertas; novo teste aprovado antes de repetir build/Chrome final.

Cópias públicas/exames/fingerprints/dump integral `pre-3A-3-1-2*` salvos, helper local `.data/upgrade_3a312.py`. Comparação após testes privados aprovada, zero schemas privados antes do dump. Logs/capturas ficam em `.data`, ignorados pelo Git. Apenas dados fictícios em `erp-dents-homolog`; nenhum volume removido. Não afirmar ensaio de estações físicas ou capacidade da clínica com testes no mesmo PC.

Regressões Chrome: painel observou criação em 15298ms/22 GETs no cenário completo, consulta em 15222ms/19 GETs clínicos, agenda lista/calendário em 15033ms/14968ms e oito leituras cada. Preservação de filtros/rascunhos/versões, falha/recuperação, pausa por visibilidade e ausência de escrita automática aprovadas; painel incluiu meia-noite controlada em São Paulo/Tóquio. Cenários de leitura aprovados antes do último ajuste do guard de escrita; novo fluxo de permissões e suíte completa repetidos depois dele.

## Retomada

Falta concluir revisão visual das capturas sem transição de tema, publicação/CI, atualização somente web e preservação. Depois fechar 3A.3.1.2/3A.3.1 e iniciar 3A.3.2.1 (lista/resumo financeiro). R19 permanece parcial para atualização das demais telas/referências; não repetir testes aprovados sem mudança/falha.
