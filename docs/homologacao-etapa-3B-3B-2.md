# 3B.3B.2 — Horário clínico nas telas

## Alteração — 26/10/2026

Formulários, duração sugerida, filtros da agenda, calendário e painel usam `America/Sao_Paulo`, independentemente do fuso do computador. Exibições compartilhadas de instantes, referências financeiras e pagamentos seguem o mesmo horário. Datas civis (nascimento e vencimento) continuam sem conversão de fuso.

Horários inexistentes ou repetidos em mudanças históricas de horário de verão apresentam erro antes do envio. Horários originais não alterados mantêm offset, segundos e microssegundos. A ordenação do intervalo considera microssegundos. Os filtros inclusivos abrangem o último microssegundo do dia clínico, inclusive dias com 23 ou 25 horas.

O calendário usa um adaptador Luxon 3.7.2 restrito à clínica, sem alterar configuração global nem deslocar artificialmente os objetos Date. A seleção de dias inteiros corrige o cálculo da biblioteca que dependia do computador. A compensação de segmentos pelo fuso do navegador foi desativada porque a aritmética já usa dias clínicos. Removida a dependência direta date-fns 3.6.0, agora sem consumidor; permanece a dependência transitiva própria do calendário.

## Evidências locais

- Componentes/utilitários: 493 testes frontend aprovados; 95 focados aprovados em UTC e Tóquio, incluindo rejeição antes de pagamentos, rascunhos, duração, precisão, dias históricos e virada do painel.
- TypeScript/build e imagem web aprovados, incluindo reconstrução após retirar a dependência direta sem uso. npm sem vulnerabilidades.
- Chrome/API: quatro fusos (São Paulo, UTC, Tóquio e Nova York) concordam na lista, editor, filtro, posição do evento, navegação de dia/semana/mês/Hoje, seleção do mês e de horário na grade semanal. Quatro consultas criadas pela interface; reabertura em outro fuso preserva o horário clínico.
- SQL privado: consulta de referência preservada e quatro criações com início/fim esperados. Nenhuma inferência de banco apenas pela aparência da tela.
- Limite inclusivo: fixture histórica inserida/ajustada somente no schema privado com início `23:59:59.999998` e fim `23:59:59.999999` clínicos aparece na resposta HTTP do filtro nos quatro fusos. Esse preparo via SQL verifica o filtro, não o aceite de disponibilidade de uma consulta tão curta.
- Chrome/API/SQL: 12 edições reais em lista/calendário nos três primeiros fusos preservam horários originais e alteram somente o limite escolhido, com versão correta.
- Chrome/API/SQL: três consultas criadas em outro fuso foram reabertas, reagendadas e canceladas pela interface; horários e versões conferidos no banco.
- Chrome/API/SQL: pagamento histórico digitado em UTC salva o instante clínico esperado e exibe 22:30 de São Paulo. Respostas perdidas de pagamento/estorno recuperam a mesma operação; correção/nova baixa e histórico preservados. Banco confirma um único pagamento no instante informado.
- Regressão de cadastros Chrome/API/SQL aprovada na imagem final: CPF, nascimento, documentos legados, rascunho, busca, permissões, concorrência e reabertura.
- Artefatos locais ignorados em `.data/`: `clinic-integration-tests-final.log`, `clinic-integration-UTC.log`, `clinic-integration-Tokyo.log`, `clinic-integration-browser-complete.log`, `clinic-integration-precision.log`, `clinic-integration-financial.log`, `clinic-integration-registration.log`, `clinic-integration-deletion-UTC.log`.

## Fechamento

CI `40373905074` identificou cinco expectativas antigas de exclusão que calculavam a mensagem pelo fuso do computador. Corrigidas para o horário clínico explícito em `1b24fbb`; sete testes de exclusão aprovados em UTC. [CI final 40374303424](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/40374303424) aprovado: 493 frontend, 328 backend (758,797 s), builds/HTTP, auditorias de pacotes e seis imagens sem achados; base de vulnerabilidades atualizada em 26/10 às 14:38 UTC. Código funcional `89e3be3`. Seleção semanal/mensal usa cliques reais nas coordenadas livres das células, pois a camada de eventos intercepta o localizador direto do fundo; não houve correção adicional do produto.

Versão de instalação `piloto-cadastros-v0.1.22`, guias atualizados. Liberação permanece restrita ao piloto de cadastros. Consolidação documental e ampliação do harness não alteram as imagens do código aprovado; ensaios locais do harness aprovados.

Sem alteração de API, schema, migração ou configuração do servidor. Containers principais e volumes preservados; os testes usam apenas recursos privados de `erp-dents-homolog`, dados fictícios e limpeza desses recursos. Ensaio operacional de atualização não repetido. A instalação física continua pendente dos dados do computador.

O contrato de offset/valores nulos da API (R21), a cobertura ampliada de eventos históricos/multidia e o percurso recepção → consulta → lançamento → pagamento permanecem no plano; não declarar toda a homologação do ERP concluída.
