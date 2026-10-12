# 3A.3.7.3B — referências do calendário

Em validação em 12/10/2026, base `d4f9c66`. [Contrato](./plano-etapa-3A-3-7-3.md). Sem alteração de API/schema.

## Implementação

- Botão, evento e intervalo da grade iniciam a mesma preparação por ação. Cliques repetidos não substituem rascunho/intervalo; não há leitura ociosa de pacientes/procedimentos. Dentistas da grade têm leitura independente e atualização explícita de cores.
- Referências do formulário permanecem estáveis durante polling da agenda, reconexão e invalidação. Duração responde à escolha de procedimento/início; atualizar cadastros conserva fim automático/manual, com aplicação explícita da nova sugestão.
- Falha parcial, negação, ausência e inativação usam o protocolo compartilhado já validado; seleção ausente não é substituída. Perda de acesso a dentistas também remove a cópia das cores, usando cores alternativas sem ocultar consultas ainda autorizadas.
- Revisão de disponibilidade rejeita falha/cancelamento e não é liberada pela atualização comum de opções. Versão capturada e revisão de exclusão permanecem; recarga explícita cancela e ignora resultados após desmontagem/troca de ação.

## Validação

- 11 testes novos do calendário, cobrindo as três entradas, repetição, intervalo, duração, navegação/cores, versão, ausência, falha parcial, permissões, suspensão, cancelamento e revisão de disponibilidade. Grade simulada nesses testes; não equivale a Chrome real.
- Suíte completa: 324 testes/39 arquivos (47,76s); TypeScript/Vite aprovado (8,73s), npm/Python e seis imagens sem achados. Ensaios antigos passaram a aguardar preparação e distinguir mensagens da grade/referências; preservam conflitos/exclusão. Primeiro ensaio novo corrigiu apenas expectativa de hexadecimal normalizado em maiúsculas. Aviso preexistente de bundle acima de 500kB permanece.
- Chrome inicial aprovado: sessões independentes, duração remota sem mudar horários, 503/recuperação, 403 real/concessão, 409 real com versão antiga, cancelamento, cores independentes e seleção real por mouse de 10h–11h preservada após atualização. Ensaio final ampliado com conflito real de disponibilidade e revisão falha/bem-sucedida em execução; regressão de exclusão e CI pendentes.
- Backups `pre-3A-3-7-3B*` preservados; helper `.data/upgrade_3a373b.py` somente `after`. Principal ainda na versão anterior. Pendentes: aceites finais Chrome/CI, atualização somente web/HTTPS/dez verificações/preservação/revisão/limpeza e fechamento/publicação.
- Fixtures exclusivamente fictícias em schemas privados de `erp-dents-homolog`; logs/capturas em `.data` ignorada. Nenhuma credencial publicada.

Próximo após aceite: 3A.3.7.4, referências do financeiro. R19 parcial; instalação assistida na etapa 5. Chrome no mesmo PC não comprova capacidade/estações físicas/outros navegadores.
