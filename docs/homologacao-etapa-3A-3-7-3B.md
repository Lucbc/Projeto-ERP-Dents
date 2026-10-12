# 3A.3.7.3B — referências do calendário

Concluída em 12/10/2026, implementação `bae3fb2`, base `d4f9c66`. [Contrato](./plano-etapa-3A-3-7-3.md). Sem alteração de API/schema.

## Implementação

- Botão, evento e intervalo da grade iniciam a mesma preparação por ação. Cliques repetidos não substituem rascunho/intervalo; não há leitura ociosa de pacientes/procedimentos. Dentistas da grade têm leitura independente e atualização explícita de cores.
- Referências do formulário permanecem estáveis durante polling da agenda, reconexão e invalidação. Duração responde à escolha de procedimento/início; atualizar cadastros conserva fim automático/manual, com aplicação explícita da nova sugestão.
- Falha parcial, negação, ausência e inativação usam o protocolo compartilhado já validado; seleção ausente não é substituída. Perda de acesso a dentistas também remove a cópia das cores, usando cores alternativas sem ocultar consultas ainda autorizadas.
- Revisão de disponibilidade rejeita falha/cancelamento e não é liberada pela atualização comum de opções. Versão capturada e revisão de exclusão permanecem; recarga explícita cancela e ignora resultados após desmontagem/troca de ação.

## Validação

- 11 testes novos do calendário, cobrindo as três entradas, repetição, intervalo, duração, navegação/cores, versão, ausência, falha parcial, permissões, suspensão, cancelamento e revisão de disponibilidade. Grade simulada nesses testes; não equivale a Chrome real.
- Suíte completa: 324 testes/39 arquivos (47,76s); TypeScript/Vite aprovado (8,73s), npm/Python e seis imagens sem achados. Ensaios antigos passaram a aguardar preparação e distinguir mensagens da grade/referências; preservam conflitos/exclusão. Primeiro ensaio novo corrigiu apenas expectativa de hexadecimal normalizado em maiúsculas. Aviso preexistente de bundle acima de 500kB permanece.
- Chrome inicial aprovado: sessões independentes, duração remota sem mudar horários, 503/recuperação, 403 real/concessão, 409 real com versão antiga, cancelamento, cores independentes e seleção real por mouse de 10h–11h preservada após atualização. Ensaio final ampliado aprovado: conflito real de disponibilidade, atualização comum não libera bloqueio, 503 na revisão mantém rascunho, leitura bem-sucedida e correção explícita permitem criar. Três escritas explícitas; capturas claro/escuro/intervalo inspecionadas.
- Backups `pre-3A-3-7-3B*` preservados; helper `.data/upgrade_3a373b.py` somente `after`. Somente web da homologação atualizada após aceites locais enquanto CI rodava isolado; HTTPS/assets idênticos ao build, dez verificações integradas e comparação de linhas/referências/bytes aprovados. Revisão `0024_user_version`, zero schemas temporários, nenhum volume removido. Fechamento aguardou CI aprovado.
- Fixtures exclusivamente fictícias em schemas privados de `erp-dents-homolog`; logs/capturas em `.data` ignorada. Nenhuma credencial publicada.

Próximo após aceite: 3A.3.7.4, referências do financeiro. R19 parcial; instalação assistida na etapa 5. Chrome no mesmo PC não comprova capacidade/estações físicas/outros navegadores.

## Aceite final

- Regressão Chrome de exclusão aprovada: lista/calendário rejeitam versão antiga após reagendamento, preservam rascunho, exigem revisão explícita e nova confirmação, tratam ausência e conservam cobranças/histórico. Captura do calendário inspecionada; fixtures privadas limpas.
- [CI 38273565070](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/38273565070) aprovado: 302 backend/324 frontend, regressões HTTP, builds e auditorias; seis imagens sem achados. Commits posteriores somente documentais.
- Evidências ignoradas: `.data/tests-3a373b-full.log`, `.data/build-3a373b-final.log`, `.data/browser-3a373b-final.log`, `.data/browser-deletion-3a373b.log`, `.data/audit-images-3a373b.log`, `.data/smoke-main-3a373b.log`, `.data/preservation-3a373b.log`, `.data/ci-final-3a373b.log`. Componentes com grade simulada são distintos de interação Chrome real e provas API/banco.
