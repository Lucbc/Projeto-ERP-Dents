# Homologação 2B.7.1 — horários válidos e fronteiras de atendimento

**Concluída em 25/09/2026**, implementação `b935d5f`, base `0d57960`, conforme [contrato](./plano-etapa-2B7.md). Não resolve a corrida entre disponibilidade e escrita da consulta, reservada à 2B.7.2. A escolha sobre compromissos existentes permanece pendente.

## Alterações

- Nova regra pura `core/domain/availability.py`: dia canônico, horário real `HH:MM` entre 00:00 e 23:59 e fim maior que início. Reutilizada pelo schema de entrada e caso de uso; não converte silenciosamente valores inválidos.
- Agenda compara horas completas, incluindo segundos/microssegundos. Fim exatamente no limite é aceito; qualquer ultrapassagem é recusada. Mantidos timezone America/Sao_Paulo, convenção atual de datetimes sem fuso, duração positiva, mesma data local, intervalos separados e tratamento de cancelados.
- Leitura de disponibilidade usa schema de resposta separado: strings legadas continuam visíveis, sem regravação automática. Intervalo inválido não concede disponibilidade; cadastro pode ser corrigido explicitamente. Nenhuma migração.
- Formulário valida horas reais e deixa de truncar segundos ou remover linhas incompletas silenciosamente. Avisa sobre horários legados inválidos, mantém rascunho e exige correção explícita antes de salvar. Removidos parser antigo de minutos e normalização truncadora da interface.

## Validação local

- **38 backend focados aprovados em 183,008s**, incluindo sete novos testes e regressão de versões/concorrência de consultas e dentistas. Cobrem schema/domínio, datas fixas, fuso, fronteiras, pausa/turnos adjacentes, legado e cancelados. Casos existentes exercitam PostgreSQL e rollback dos vínculos.
- **Cinco testes de frontend aprovados em 54,73s**, quatro novos casos de valores legados (25:00, minuto 60, segundos e vazio) mais regressão de conflito/recarga do dentista. Correção explícita preserva o rascunho e envia versão/horários corretos.
- Build API/web aprovado. HTTP isolado: **dez grupos aprovados**, inclusive 422 sem alterar cadastro/versão, limites exatos, rejeição de criação/edição/reativação fora do turno, leitura de legado e correção explícita. Primeira tentativa excedeu o prazo de inicialização do harness durante testes paralelos; repetição após conclusão dos testes focados passou, sem mudança de produto.
- Diagnóstico agregado em transação somente de leitura na principal: **um dentista, zero disponibilidades inválidas e zero intervalos inválidos**. Nenhum nome/horário ou dado clínico impresso. Não extrapolar o resultado para outras instalações.
- **Chrome no harness HTTPS privado aprovado:** horário legado com segundos permanece intacto na abertura; aviso visível; intervalo invertido não envia requisição nem perde rascunho; correção explícita salva versão/horário corretos e persiste após recarregar. Duas capturas conferidas.

## Entrega e regressão completa

- Cópias públicas/exames/fingerprints/dump completo `pre-2B7-1*` salvos localmente; helper `.data/upgrade_2b71.py`. API/web principais atualizados juntos; dez verificações gerais aprovadas. Comparação integral confirmou linhas de negócio/histórico e bytes de exames preservados. Revisão `0022_dentist_user_restrict`, zero schemas descartáveis e nenhum volume removido. Primeira chamada durante startup retornou 502; repetição após prontidão passou.
- Implementação `b935d5f` publicada, HEAD remoto conferido. [CI 36206543443](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/36206543443) aprovado em **16min50s**: **254 backend em 599,046s e 102 frontend**, builds, regressão HTTP e auditorias; seis imagens sem achados nessa execução. Regressão completa executada no CI, sem duplicação local; Chrome foi validado localmente no ambiente privado.
- Gateway no CI: 413/503, JSON 408 em 30,011s, vagas liberadas e 80 chamadas de saúde com p95 de 0,0364s. Esses testes não representam carga de produção.
- Plano/R18 atualizados. Logs, capturas, credenciais e cópias permanecem locais. Próxima etapa 2B.7.2 depende da resposta sobre compromissos existentes; silêncio não é escolha. Homologação em **https://localhost:18443**; recarregar abas antigas.

- Revisão final: comprimento exato de cinco caracteres também rejeita quebra de linha após o horário; cinco casos novos de frontend aprovados em 6,67s e build web final aprovado. Esse complemento foi coberto novamente no CI completo.
