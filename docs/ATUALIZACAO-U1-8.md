# U1.8 — preservar RG durante digitação

Iniciada em 19/10/2026, base `f113de0`. Instalação permanece `piloto-cadastros-v0.1.9` até concluir os aceites.

## Problema e correção

O formulário removia pontuação, convertia letras para maiúsculas e cortava o RG durante a digitação. O teste de componente reproduziu a perda de conteúdo antes da correção: 19 testes aprovados e uma falha esperada. Removida a função `normalizeRg` e seu tratamento de entrada; RG passa a usar o campo de texto sem transformação durante a digitação.

Não há imposição de formato estadual único, validação de autenticidade ou preenchimento obrigatório. A remoção de espaços nas extremidades ao salvar e a conversão de campo vazio em nulo continuam iguais. Históricos não são regravados automaticamente. API e banco já aceitam texto; nenhuma migração, dependência ou configuração alterada.

## Critérios de aceite

- Componente: preservar pontuação, letras e valor longo ao abrir, alterar e enviar.
- Chrome/API: criar e consultar RG integral, editar, preservar rascunho em conflito, recarregar e reabrir após salvar; limpar explicitamente o campo.
- PostgreSQL privado: confirmar valor integral criado e nulo após limpeza explícita.
- Build, suíte frontend e CI aprovados antes de consolidar versão de instalação.

## Evidências e retomada

Componente antes/depois: `.data/rg-components-before.log` e `.data/rg-components-after.log`; após correção, 20 testes aprovados. Build e suíte frontend em andamento. Testes integrados usam somente recursos privados de `erp-dents-homolog` e dados fictícios. Não atualizar os containers principais nem remover volumes.

Esta alteração é exclusiva do frontend. Não modifica procedimentos de instalação/backup; uma eventual liberação exige atualizar a tag indicada nos guias. O ensaio completo de atualização anterior está registrado na U1.7; não considerá-lo uma execução desta entrega. P3 físico continua prioritário quando chegarem os dados do servidor da clínica.
