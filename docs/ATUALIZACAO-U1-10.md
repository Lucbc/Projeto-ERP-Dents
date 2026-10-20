# U1.10 — aviso antes de expirar a sessão

Iniciada em 20/10/2026, base `46befa7` (`piloto-cadastros-v0.1.11`). Implementação em validação; nenhuma nova versão liberada ainda.

## Diagnóstico e mudança

Chrome/API/PostgreSQL privados, com sessão real de um minuto, confirmaram que expirar durante a digitação remove o formulário, não grava o rascunho e não o transfere ao novo login. Requisição manual com cookie expirado recebeu 401. Banco permaneceu sem pacientes e comprovantes. O teste de componente reproduziu ausência de aviso: 23 aprovados e uma falha esperada.

Adicionado aviso visível nos últimos cinco minutos da sessão, usando a expiração já informada pelo servidor. O aviso não grava, renova ou prolonga a sessão. O usuário deve salvar enquanto ainda tem acesso; campos não salvos continuam descartados ao encerrar. Sessões configuradas para cinco minutos ou menos exibem o aviso desde o início. Revogação administrativa pode encerrar o acesso antes do prazo; o aviso não altera essa proteção.

Não há persistência de rascunhos em localStorage/sessionStorage nem transferência entre logins. Sem migração, mudança de API, dependência ou configuração. O prazo configurado no servidor não foi alterado.

## Aceites

- Aviso ausente antes do limite, presente nos cinco minutos finais; rascunho preservado enquanto autenticado e expiração original mantida.
- Expiração por timer e ao retomar aba suspensa; cache, rascunhos e requisições antigos continuam isolados.
- Chrome com expiração real, aviso visível, descarte do rascunho, novo login limpo e recusa HTTP de cookie expirado.
- SQL privado confirma ausência de gravação automática.
- Regressão de troca de sessão no navegador, build, frontend e CI completos antes da nova tag.

## Evidências e retomada

Diagnóstico antes: `.data/session-expiry-before.log` e `.data/session-expiry-component-before.log`. Após correção, 24 testes de sessão aprovados (`.data/session-expiry-components.log`). Build e aceites finais em andamento.

Somente recursos privados de `erp-dents-homolog`, dados fictícios, sem alteração dos containers principais ou volumes. Instalação permanece v0.1.11 até concluir aceites; atualizar guias e rotina de recepção ao consolidar. Instalação física P3 segue prioritária quando chegarem os dados do servidor da clínica.
