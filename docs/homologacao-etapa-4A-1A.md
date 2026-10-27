# 4A.1A — regras de domínio do prontuário

## Entrega — 27/10/2026

Base `853e474`. [Núcleo clínico](../apps/api/src/core/domain/clinical_record.py) implementado sem ligação a rotas, banco ou telas. É a base da próxima persistência; não é um prontuário disponível ao usuário.

- Rascunho vinculado à consulta/paciente/dentista; autoria obtida do usuário fornecido pelo servidor.
- Leitura exige permissão explícita para todos os perfis, inclusive admin. Criar/alterar exige também dentista ativo vinculado; outro usuário não assume autoria mesmo que vinculado ao mesmo dentista.
- Criação exige dentista da consulta. Edição/finalização/adendo exigem autor original e vínculo preservado.
- Versão obrigatória e conflitos controlados; rascunho vazio permitido, finalização vazia recusada.
- Finalização preserva texto exato e contexto clínico fornecido pelo servidor. Não altera consulta, paciente ou financeiro.
- Adendos exigem finalização prévia, texto/motivo, identidade distinta e autoria; preservam texto/contexto/instante de finalização. Nome do autor do registro e nome do autor do adendo são capturados separadamente.
- Objetos imutáveis em memória; transições retornam nova versão. Instantes exigem fuso e são mantidos em UTC com precisão.

## Validação

[14 testes de domínio](../apps/api/tests/test_clinical_record_domain.py) aprovados na imagem `erp-dents-homolog-api`, em container temporário identificado pelo projeto, sem rede, sem banco e com código/testes montados somente para leitura. Incluem todas as transições, permissões revogadas, admin sem permissão, troca de autor/vínculo, versões desatualizadas, preservação do original, adendo repetido e contexto inválido.

O Python do host falhou ao importar uma dependência existente (`email-validator` ausente). Nenhuma dependência foi instalada/alterada; a execução final usou a imagem do projeto com suas dependências. Esse erro de ambiente não foi contado como teste aprovado.

Sem prova nova HTTP, PostgreSQL ou interface. CI completo não repetido nesta subetapa: módulo novo ainda sem consumidores em produção; validação focada executou o código novo na imagem existente. Sintaxe/importação cobertas pelos testes; links locais e `git diff --check` conferidos. Não houve rebuild, migração, reinício de serviços principais ou acesso a volumes de dados.

## O que ainda falta

Imutabilidade Python não protege SQL externo. A comparação de versão em memória não garante concorrência de transações. Repetição de finalização/adendo ainda precisa de recibo transacional para recuperar a operação exata após perda de resposta, sem duplicação. Não expor essas funções diretamente em uma rota sem a camada de persistência.

**Próximo 4A.1B:** tabelas/migração aditiva, repositório transacional com comparação de versão e idempotência, restrições de histórico/vínculos e testes PostgreSQL isolados. Resolver a relação entre registro e alteração/exclusão da consulta antes de habilitar escrita. Permissões devem ser lidas/validadas na operação, sem confiar em payloads do cliente. Depois ligar API e matrizes reais, cobrindo a exceção administrativa existente, antes da interface 4B.

4A continua em andamento. Instalação permanece `piloto-cadastros-v0.1.23`, sem procedimento novo; o núcleo não amplia o piloto de cadastros. P3 físico prioritário quando houver dados do servidor.
