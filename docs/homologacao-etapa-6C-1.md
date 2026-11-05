# 6C.1 — financeiro com operador restrito

Data: 05/11/2026. Base de produto `f17b15f`, instalação v0.1.26. Mudança somente no ensaio e na documentação; nenhuma regra de produto, migração ou configuração alterada.

## Recorte e método

Reutiliza `smoke_operational_journey_homolog.py/.cjs`, com modo opcional ativado por `smoke_restricted_billing_homolog.py`. Schema, API, web e contas temporários de `erp-dents-homolog`, exclusivamente fictícios. A versão original do percurso administrativo permanece disponível.

O administrador prepara a massa e as permissões, mas a geração/baixa/histórico são executados por outra sessão, de coordenador. Todas as permissões desse perfil começam negadas; são concedidas somente leitura de Painel/Consultas/Financeiro e criação/alteração de Financeiro. Sem acesso ao catálogo de pacientes, usuários, permissões, exclusão financeira ou estorno. Trata-se de fixture para verificar fronteiras, não de mudança automática dos perfis da clínica.

## Aceites por camada

- **Chrome:** recepção cadastra e agenda; dentista consulta o mesmo paciente; caixa restrito gera o lançamento da consulta, registra baixa integral e lê o histórico. Ações de exclusão e estorno não aparecem. Não depende de conta administrativa para executar essas operações.
- **HTTP:** geração 201, baixa 200, histórico autorizado; catálogo de pacientes/administração, exclusão com versão atual e estorno com payload válido retornam 403. Estado pago e versão permanecem após tentativas recusadas.
- **PostgreSQL:** um único paciente/consulta/lançamento/pagamento no percurso; horários, valor, vencimento e versões conferidos. Pagamento atribuído ao coordenador correto, sem estorno nem duplicação.
- **Isolamento:** reinício da API privada não reabre bootstrap; limpeza somente dos recursos privados, preservando volumes e containers principais.

Resultado final da execução ajustada: **aprovado**, incluindo limpeza e reinício privados. Log local ignorado `.data/restricted-billing-final.log`. Sem repetir a suíte completa de produto/CI porque a aplicação não foi alterada; CI funcional anterior `41055766576` continua sendo a evidência da v0.1.26.

## Limites e próximo recorte

Não equivale à liberação geral do financeiro, teste com dinheiro real ou validação de parcelamento. Não homologa acessibilidade: uso integral por teclado, foco inicial/confinamento/restauração dos modais e mensagens de erro ficam em **6C.2**, junto à descoberta de paciente fora dos primeiros 100 na Consulta. Inspeção de `Modal` indica ausência de gerenciamento de foco; reproduzir em navegador antes de escolher a correção compartilhada.

Odontograma registrado separadamente no [plano futuro](./PLANO-ODONTOGRAMA.md), sem implementação nesta etapa. Instalação assistida de cadastros continua na v0.1.26 e P3 físico mantém prioridade quando houver dados do servidor.
