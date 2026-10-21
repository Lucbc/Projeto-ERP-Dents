# U1.10 — aviso antes de expirar a sessão

Concluída em 20/10/2026, base `46befa7` (`piloto-cadastros-v0.1.11`). Versão liberada: `piloto-cadastros-v0.1.12`.

## Diagnóstico e mudança

Chrome/API/PostgreSQL privados, com sessão real de um minuto, confirmaram que expirar durante a digitação remove o formulário, não grava o rascunho e não o transfere ao novo login. Requisição manual com cookie expirado recebeu 401. Banco permaneceu sem pacientes e comprovantes. O teste de componente reproduziu ausência de aviso: 23 aprovados e uma falha esperada.

Adicionado aviso visível nos últimos cinco minutos da sessão, usando a expiração já informada pelo servidor. Ele aparece acima do formulário e pode ser ocultado sem encerrar a edição. O aviso não grava, renova ou prolonga a sessão. O usuário deve salvar enquanto ainda tem acesso; campos não salvos continuam descartados ao encerrar. Sessões configuradas para cinco minutos ou menos exibem o aviso desde o início. Revogação administrativa pode encerrar o acesso antes do prazo; o aviso não altera essa proteção.

Não há persistência de rascunhos em localStorage/sessionStorage nem transferência entre logins. Sem migração, mudança de API, dependência ou configuração. O prazo configurado no servidor não foi alterado.

## Aceites

- Aviso ausente antes do limite, presente nos cinco minutos finais; rascunho preservado enquanto autenticado e expiração original mantida.
- Expiração por timer e ao retomar aba suspensa; cache, rascunhos e requisições antigos continuam isolados.
- Chrome com expiração real, aviso visível, descarte do rascunho, novo login limpo e recusa HTTP de cookie expirado.
- SQL privado confirma ausência de gravação automática.
- Regressão de troca de sessão no navegador, build, frontend e CI completos antes da nova tag.

## Evidências e retomada

Diagnóstico antes: `.data/session-expiry-before.log` e `.data/session-expiry-component-before.log`. Após correção, 24 testes de sessão aprovados (`.data/session-expiry-components-final.log`), build TypeScript/Vite/imagem web aprovado (`.data/session-expiry-build-final.log`), 409 testes frontend em 46 arquivos (142,01 s, `.data/session-expiry-frontend.log`). Chrome/API/SQL com expiração real, aviso acima do formulário, ocultação e novo login aprovado (`.data/session-expiry-browser-final.log`). Imagem fictícia conferida visualmente em `.data/homolog/session-expiry-warning.png`. Banco sem pacientes/comprovantes; bootstrap/reinício/limpeza aprovados.

Regressão de troca de sessão em Chrome aprovada (`.data/session-expiry-navigation.log`): revogação real, 401, descarte do formulário, ausência de consultas privadas por 32 segundos no login, cancelamento de requisição antiga e isolamento após novo login. Um 403 de recurso preserva a sessão. Bootstrap/reinício/limpeza aprovados.

Código `1a52487`. [CI 39473228288](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/39473228288) aprovado: 325 testes backend, 409 frontend, builds, regressões HTTP e auditorias das seis imagens sem achados. Log local `.data/session-expiry-ci-final.log`. Guias de instalação/atualização e rotina da recepção atualizados para v0.1.12.

O ensaio operacional de atualização e restauração da U1.9 não foi repetido: esta entrega altera somente a interface, sem nova migração. A evidência anterior permanece identificada na [U1.9](./ATUALIZACAO-U1-9.md); não representa instalação física da v0.1.12 na clínica.

Somente recursos privados de `erp-dents-homolog`, dados fictícios, sem alteração dos containers principais ou volumes. Instalação física P3 segue prioritária quando chegarem os dados do servidor da clínica. Próximo recorte: diagnosticar navegação ou fechamento acidental durante preenchimento, sem persistir rascunhos sensíveis.
