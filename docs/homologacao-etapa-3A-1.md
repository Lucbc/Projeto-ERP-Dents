# Homologação 3A.1 — agenda atualizada entre sessões

Início em 30/09/2026 sobre `8184f83`. Sem migração ou mudança de API. Escopo: consultas da lista e calendário da agenda; painel, fila do dentista e demais recursos permanecem nos próximos recortes de R19.

## Comportamento

- Leitura a cada 15 segundos com página visível/conectada; erro de leitura espaça o intervalo para 60 segundos. Retorno à página, reconexão e botão permitem nova tentativa. Não é garantia de resposta em 15s quando há rede lenta, suspensão ou indisponibilidade.
- Usa o gerenciador de consultas existente, sem polling global. Requisição em andamento é compartilhada; ação manual/foco não cancela para reiniciar a mesma leitura. Mudança de filtro/desmontagem cancela a leitura pelo sinal passado ao cliente HTTP; isolamento de sessão anterior permanece.
- Última leitura bem-sucedida e estado de atualização/conexão visíveis. Falha inicial não vira agenda vazia; falha após sucesso conserva a leitura com aviso. 401/403 oculta dados/formulário, remove cache de consultas e suspende novas leituras naquela página até nova entrada.
- Atualização da lista não troca campos/identidade/versão de formulário ou confirmação. Catálogos não recebem polling; reconexão não recarrega referências enquanto o formulário está aberto, evitando recalcular fim sugerido. Não há reenvio de mutação pelo mecanismo de atualização.

## Validação local

| Camada | Evidência |
| --- | --- |
| Política de leitura | Oito testes com relógio controlado: 15s, pausa/retorno, offline/reconexão, foco, leitura lenta sem sobreposição, falha com dados anteriores, falha inicial/60s, 401/403, cancelamento por filtro/desmontagem |
| Formulários | Dois testes existentes ampliados para lista/calendário: atualização remota e 503 mantêm notas/fim/versão; referências não recarregam, conflito exige revisão e 403 oculta dados. Aprovados |
| Regressão frontend | Primeira execução completa: 128 de 129 passaram. Um teste detectou dois avisos de carregamento; unificados na interface e adaptada ação manual para o botão comum. Depois, 14 testes dos três módulos afetados passaram em 5,66s; complemento de acesso nas duas telas passou em 3,29s. Não contar a primeira execução completa como aprovada |
| Builds | TypeScript/Vite e imagem web aprovados. Aviso de bundle maior que 500kB permanece; otimização geral de carregamento não faz parte desta entrega |
| Chrome inicial | Dois contextos/sessões independentes, HTTPS confiável: criação/reagendamento/cancelamento/exclusão remotos, edição antiga 409 com rascunho mantido, falha 503/recuperação, ausência de escrita automática e pausa de leituras em visibilidade controlada. Aprovado |
| Chrome complementar | Filtros de data da lista e visualização do calendário preservados. Criação remota observada em 15044ms na lista e 14983ms no calendário; oito GETs de lista em cada cenário completo (incluindo tentativas manuais/falhas/recuperação), nenhum durante 17s de visibilidade oculta controlada. Capturas com rascunho e aviso sem modal nos temas claro/escuro inspecionadas e legíveis |
| HTTP | Dez grupos de `smoke_appointment_version_homolog.py` aprovados: pré-condições, conflito entre edições, cancelamento antigo, revisão, vínculos e ausência após exclusão. Reutiliza contrato transacional existente; não houve mudança de banco |

Chrome usa uma sessão autora de requisições e outra receptora na UI, com uma consulta fictícia por cenário, no mesmo computador. Visibilidade/foco são eventos controlados no navegador; não foi ensaio de suspensão física ou carga de várias estações. Componentes verificam reconexão e cancelamento; HTTP/CI devem comprovar regressão do contrato existente. Não acrescentar testes de banco para código de apresentação sem alteração transacional.

## Entrega

Cópias públicas/exames/fingerprints `pre-3A-1*` salvas antes da atualização; helper local `.data/upgrade_3a1.py` compara todas as colunas de negócio, incluindo versões, e bytes dos exames, sem imprimir conteúdo. Apenas `erp-dents-homolog`, dados fictícios e arquivos locais ignorados.

**Pendentes:** CI completo, cópia integral após zero schemas privados, atualização web/preservação e publicação do fechamento. Principal ainda usa a imagem anterior; API/banco não requerem atualização nesta entrega.
