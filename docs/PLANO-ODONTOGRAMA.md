# Odontograma — implementação posterior

Registrado em 05/11/2026 por solicitação do usuário. **Planejado, não implementado.** Não bloqueia o piloto de cadastros nem substitui a etapa 6C atual.

## Necessidades confirmadas

- Selecionar um dente no odontograma do paciente.
- Registrar o procedimento realizado e sua data.
- Manter vários eventos no mesmo dente, com histórico consultável.
- Associar uma cor a cada procedimento e permitir visualizar várias cores no mesmo dente, sem sobrescrever eventos anteriores.

## Proposta de recortes

1. **Contrato e desenho:** definir identificação dos dentes, histórico por dente, legenda e representação de vários procedimentos. Prototipar e validar com o usuário antes de implementar a representação clínica.
2. **Persistência e API:** eventos vinculados ao paciente/dente, procedimento, data e autoria; permissões explícitas, concorrência e política de correção. Migração aditiva, sem converter notas antigas automaticamente.
3. **Interface:** seleção por mouse/teclado, registro e consulta de eventos, legenda e visualização de várias cores; apresentar texto além da cor para diferenciar procedimentos.
4. **Homologação e pacote:** componentes, API, banco e navegador; atualização/backup/restauração e preservação do histórico antes de habilitar para atendimento.

## Decisões a confirmar ao iniciar

- Dentição permanente, decídua ou mista e sistema de numeração.
- Marcação por dente inteiro ou também por faces; a posição de uma cor não deve sugerir uma face clínica sem essa definição.
- Mostrar todas as cores simultaneamente por segmentos/marcadores ou filtrar por data/procedimento, mantendo visível a existência de outros eventos.
- Paleta por procedimento e comportamento quando a cor/nome do catálogo mudar: preservar a referência histórica.
- Incluir apenas realizados inicialmente ou também planejamento/condições preexistentes, com distinção explícita.
- Relação com consulta/evolução, responsável pela escrita e permissão de leitura; criação independente não deve gerar cobrança automaticamente.
- Correção de eventos finalizados e preservação do original: definir fluxo antes de permitir edição/exclusão clínica.

## Critérios de aceite propostos

- Dois ou mais eventos no mesmo dente mantêm datas, autoria e procedimentos independentes após salvar, reabrir e reiniciar.
- Procedimentos distintos apresentam cores e legenda identificáveis; nenhum evento desaparece ao acrescentar outro, inclusive se as cores coincidirem.
- Pacientes/dentes não compartilham eventos indevidamente; requisições sem permissão são recusadas também pela API.
- Duas sessões não sobrescrevem alterações silenciosamente; correções preservam a rastreabilidade definida no contrato.
- Histórico e vínculos sobrevivem à atualização e à restauração de backup; interface funciona por teclado e sem depender apenas da percepção de cores.

Prioridade: retomar após o recorte atual de homologação/usabilidade, ou antecipar por decisão explícita do usuário. Instalação física P3 mantém prioridade quando os dados do servidor estiverem disponíveis.
