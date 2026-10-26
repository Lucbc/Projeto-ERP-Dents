# 3B.3B.2 — Horário clínico nas telas

## Alteração — 26/10/2026

Formulários, duração sugerida, filtros da agenda, calendário e painel usam `America/Sao_Paulo`, independentemente do fuso do computador. Exibições compartilhadas de instantes, referências financeiras e pagamentos seguem o mesmo horário. Datas civis (nascimento e vencimento) continuam sem conversão de fuso.

Horários inexistentes ou repetidos em mudanças históricas de horário de verão apresentam erro antes do envio. Horários originais não alterados mantêm offset, segundos e microssegundos. A ordenação do intervalo considera microssegundos. Os filtros inclusivos abrangem o último microssegundo do dia clínico, inclusive dias com 23 ou 25 horas.

O calendário usa um adaptador Luxon 3.7.2 restrito à clínica, sem alterar configuração global nem deslocar artificialmente os objetos Date. A seleção de dias inteiros corrige o cálculo da biblioteca que dependia do computador. A compensação de segmentos pelo fuso do navegador foi desativada porque a aritmética já usa dias clínicos. Removida a dependência direta date-fns 3.6.0, agora sem consumidor; permanece a dependência transitiva própria do calendário.

## Evidências locais

- Componentes/utilitários: 493 testes frontend aprovados; 95 focados aprovados em UTC e Tóquio, incluindo rejeição antes de pagamentos, rascunhos, duração, precisão, dias históricos e virada do painel.
- TypeScript/build e imagem web aprovados. Após retirar a dependência direta sem uso, repetir build da imagem e regressões finais.
- Chrome/API: quatro fusos (São Paulo, UTC, Tóquio e Nova York) concordam na lista, editor, filtro, posição do evento, navegação de dia/mês/Hoje e seleção do mês. Quatro consultas criadas pela interface; reabertura em outro fuso preserva o horário clínico.
- SQL privado: consulta de referência preservada e quatro criações com início/fim esperados. Nenhuma inferência de banco apenas pela aparência da tela.
- Chrome/API/SQL: 12 edições reais em lista/calendário nos três primeiros fusos preservam horários originais e alteram somente o limite escolhido, com versão correta.
- Artefatos locais ignorados: `.data/clinic-integration-tests-final.log`, `clinic-integration-UTC.log`, `clinic-integration-Tokyo.log`, `clinic-integration-browser-final.log`, `clinic-integration-precision.log`.

## Pendências para liberar

Regressões finais de cadastros e pagamentos, build após limpeza da dependência e CI. Instalação permanece `piloto-cadastros-v0.1.21` até aprovação. Não ampliar o piloto além de cadastros.

Sem alteração de API, schema, migração ou configuração do servidor. Containers principais e volumes preservados; os testes usam apenas recursos privados de `erp-dents-homolog`, dados fictícios e limpeza desses recursos. Ensaio operacional de atualização não repetido. A instalação física continua pendente dos dados do computador.

O contrato de offset/valores nulos da API (R21), a cobertura ampliada de eventos históricos/multidia e o percurso recepção → consulta → lançamento → pagamento permanecem no plano; não declarar toda a homologação do ERP concluída.
