# Homologação 3A.2.1 — painel atualizado entre sessões

Início em 01/10/2026, base `6eeb036`. Contrato: [3A.2.1](./plano-etapa-3A-2.md). Sem migração ou mudança de contrato HTTP. Consulta do dentista permanece na 3A.2.2.

## Implementação

- Painel usa leituras independentes para contagens de pacientes/dentistas e consultas do dia. Cada recurso mostra sua própria última atualização/erro/ação manual. Nenhum indicador presume zero antes de sucesso; falha transitória conserva dados anteriores com aviso. Consultas passadas/canceladas continuam no conjunto, agora com status e título “Consultas de hoje”.
- Política opt-in reaproveitada da agenda: 15s visível/conectado, 60s após falha, foco/retorno/reconexão/manual, sem sobreposição por chave ou escrita automática. Sinal de cancelamento também passado aos serviços de pacientes/dentistas/permissões. Seletores/catálogos de outras páginas não recebem polling.
- Permissões usam a chave compartilhada `permissions/me/identidade`, atualizada enquanto o painel permanece montado. Administrador não faz leitura desnecessária de matriz. O guard específico do painel substitui o guard estático interno dessa rota; a rota externa autenticada permanece. Falha/ausência de verificação oculta os indicadores, mantendo o mecanismo de recuperação montado. Negação de página bloqueia todas as seções; negação de recurso bloqueia apenas seu indicador.
- Leituras do painel têm identidade na chave e descarte de cache ao desmontar. 401/403 remove apenas a consulta correspondente e bloqueia novas leituras naquela instância; o padrão anterior da agenda permanece. Contadores armazenam somente o total, não o primeiro cadastro retornado pelo endpoint.
- Dia local do navegador observado na meia-noite e no retorno/foco/reconexão; chave da agenda inclui limites enviados. Troca de dia descarta leitura anterior e cancela resposta atrasada. Sem alteração do fuso do servidor ou definição de fuso central da clínica.

## Validação

| Camada | Evidência |
| --- | --- |
| Componentes focados | 20 testes aprovados: 12 novos do painel e oito existentes da política de leitura. Totais/status, ausência de zero fictício, erro parcial/timestamp/recuperação, 401/403 isolados, permissões de página/recursos, recuperação de autorização, pausa/rede/leitura lenta, meia-noite/retorno e identidade/resposta antiga |
| Regressão frontend | 141 testes em 23 arquivos aprovados em 75,45s; inclui agenda/formulários e demais testes existentes |
| Builds | TypeScript/Vite e imagem web aprovados. Aviso existente de bundle >500kB permanece |
| HTTP real | Seis grupos de `smoke_dashboard_access_homolog.py` aprovados em schema privado, com bootstrap/reinício/limpeza do harness: anônimo, três revogações independentes, revogação da página distinta dos recursos e sessão revogada. Incluído no CI |
| Banco | Sem mudança transacional/migração; testes HTTP usam o PostgreSQL exclusivo da homologação e schema descartável. Não criar novos testes de concorrência para uma alteração de apresentação |
| Chrome | Aprovado: duas sessões independentes (admin autor/recepção receptora), contadores/criação/cancelamento/exclusão, 503 parcial/recuperação, pausa de 17s ocultos, revogação de recurso e página. Criação observada em 15318ms; 22 GETs de API no cenário com várias ações, nenhuma escrita automática. Capturas claro/escuro inspecionadas e legíveis |
| Datas no navegador | Meia-noite controlada em `America/Sao_Paulo` e `Asia/Tokyo` aprovada, incluindo limites locais enviados na chave/consulta. Respostas de agenda simuladas nesse complemento; relógios reais do servidor/SO não alterados |

Primeiras tentativas de Chrome interrompidas na automação: seletor ambíguo para dois títulos “Painel”; depois ajuste da instalação do relógio antes de temporizadores da aplicação e uso de fronteira passada sem cruzar expiração real da sessão. Corrigido somente o harness; execução final completa aprovada. Não contar tentativas anteriores como aprovação. Visibilidade é evento controlado no mesmo computador, não suspensão física/ensaio de carga da clínica. API real foi usada no cenário principal; complemento de dois fusos usa respostas controladas.

Cópias públicas/exames/fingerprints e dump integral `pre-3A-2-1*` salvos pelo helper local `.data/upgrade_3a21.py`, dump integral após zero schemas privados. Somente web principal atualizada, dez verificações gerais aprovadas e comparação confirmou linhas de negócio/histórico/bytes preservados. API/banco permanecem na revisão 0024, nenhum volume removido. Logs/capturas/credenciais locais ignorados pelo Git.

## Fechamento — 02/10/2026

Implementação `558a3fd` publicada e HEAD remoto conferido. [CI 36907712732](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/36907712732) aprovado em 01/10/2026, em 20min53s: **302 backend em 731,710s e 141 frontend**, builds, regressões HTTP, dependências e seis imagens sem achados. Resultado conferido na retomada de 02/10; nenhum teste aprovado foi repetido apenas para fechar documentação.

Homologação atualizada em 01/10 em https://localhost:18443, HTTPS confiável 200 e bundle atual conferidos, revisão `0024_user_version`, zero schemas privados e dados preservados. Nenhum critério de aceite pendente para 3A.2.1. Publicar fechamento documental e conferir árvore limpa/HEAD remoto. **Próximo: 3A.2.2, próxima consulta e pacientes/detalhe do dentista**, conforme contrato. R19 continua parcial; fuso central da clínica, paginação geral e instalação assistida permanecem nos recortes próprios.
