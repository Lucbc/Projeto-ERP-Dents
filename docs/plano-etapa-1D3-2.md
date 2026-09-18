# Etapa 1D.3.2 — plano de sessão, CSRF e transporte

## Plano original e evolução

Preparação iniciada em 17/09/2026, sobre `8b17026`, considerando os 19% de uso restantes informados pelo usuário. Em 18/09/2026, o usuário autorizou executar a fase inteira. O mapa abaixo registra a situação anterior à migração; o estado de execução atual está no [plano geral](./PLANO-DE-EXECUCAO.md).

O contrato implementado e o roteiro de configuração estão em [sessão e HTTPS](./sessao-e-https.md). Este documento preserva as decisões de planejamento; não é evidência de homologação por si só.

## Mapa anterior à migração

| Arquivo/área | Comportamento atual e trabalho previsto |
|---|---|
| `apps/api/src/config.py` | JWT, expiração e CORS; faltam configuração de origem pública, cookie e CSRF |
| `apps/api/src/api/routers/auth_router.py` | Login retorna `access_token`; `/me` consulta identidade; logout recebe bearer. Adaptar contratos, bootstrap e troca de senha |
| `apps/api/src/api/deps/auth.py` | `OAuth2PasswordBearer`, JWT e consulta da sessão persistida. Trocar transporte preservando autorização |
| `apps/api/src/core/use_cases/auth_use_cases.py` | Login/logout e revogação existentes devem ser reaproveitados |
| `apps/api/src/adapters/db/repositories/user_repository.py` | `auth_sessions` controla validade/revogação no servidor; manter como autoridade |
| `apps/web/src/lib/session.ts` | Token em `erp_dents_token`, revisão local, cancelamento, sincronização entre abas e expiração obtida do JWT |
| `apps/web/src/lib/api.ts` | Injeta bearer e descarta respostas de sessões anteriores. Adaptar para cookie, CSRF e verificação da identidade da requisição |
| `apps/web/src/hooks/use-auth.tsx` e `apps/web/src/types/index.ts` | Login depende de `access_token`; inicialização e temporizadores precisam de metadados fornecidos pelo servidor |
| `apps/web/nginx.conf` | Serve SPA, sem proxy `/api`. Preparar acesso pela mesma origem |
| `ops/gateway/default.conf.template` | Gateway da API com proteção de uploads. Novo caminho público deve continuar passando por ele |
| Compose, scripts de homologação e `.github/workflows/verify.yml` | Web/API usam portas distintas; faltam TLS e testes do novo contrato. Smokes deverão usar cookie jar e CSRF |

## Decisões propostas para implementação

### 1. Endereço único e transporte

- Destino: navegador → endereço HTTPS da clínica → web e `/api` → gateway existente → API. Preservar limites, timeout, concorrência de upload e resolução dinâmica de DNS do gateway.
- Configurar origem pública explícita (esquema, host e porta). Não derivar confiança de `Host` ou `X-Forwarded-*` enviados livremente pelo cliente. Restringir acesso direto aos serviços internos.
- Produção com cookie exige HTTPS; configuração inválida deve falhar na inicialização. Desenvolvimento/homologação terão configuração explícita e isolada. Não adotar fallback automático para cookie inseguro.
- Preparar TLS de homologação e validar confiança no navegador, sem ignorar erros de certificado. Nome DNS, emissão/renovação e instalação de confiança nos computadores da clínica serão detalhados na etapa 5; a dependência técnica de HTTPS deve estar resolvida antes da ativação dos cookies.

### 2. Cookie e sessão persistente

- Reutilizar JWT e `auth_sessions`, mudando o transporte para cookie host-only, `HttpOnly`, `Secure`, `Path=/`, `SameSite=Lax`, com nome de produção `__Host-erp_dents_session`. Lax permite entrada por links; proteção de escrita será explícita por CSRF.
- O prefixo `__Host-` exige `Secure`, caminho `/` e ausência de `Domain`; `HttpOnly` deve ser configurado separadamente. A exceção de localhost ao requisito HTTPS não comprova funcionamento seguro na rede. Referência: [MDN — Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).
- Expiração do cookie não deve superar a sessão no servidor. Preservar revogação por logout, alteração de senha/perfil/status e validade após reinício. Não introduzir refresh tokens neste recorte.
- Não retornar JWT ao JavaScript nem armazená-lo em localStorage/sessionStorage. Remover a chave legada durante a transição.
- Cookies não oferecem isolamento por porta: usar hosts distintos para homologação/desenvolvimento e nomes distintos como proteção adicional. Não compartilhar credenciais entre ambientes no mesmo host.

### 3. CSRF e contratos HTTP

Cookies são enviados automaticamente pelo navegador; operações que alteram estado precisam de proteção contra requisições induzidas por outros sites (CSRF), inclusive login. SameSite é uma camada adicional. Referência: [OWASP — CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

- Proposta: token CSRF assinado e vinculado à sessão, enviado em cabeçalho próprio; desafio temporário anterior ao login/bootstrap, substituído após autenticação. Definir o formato e os testes antes de ativar as rotas. Não usar comparação ingênua de dois valores não assinados.
- Validar origem exata nas operações de escrita; fallback de Referer com parsing estrito quando necessário, rejeitando ausência de ambos para esses fluxos de navegador. CORS não substitui essa validação; não combinar credenciais com origem curinga.
- Cobrir login, logout, bootstrap, troca de senha, cadastros, financeiro e multipart de exames. Nenhum GET deve alterar dados de negócio.
- Disponibilizar metadados da sessão (usuário, expiração e marcador que não autentique por si só), com `Cache-Control: no-store`. O token CSRF pode ficar em memória; o token de autenticação não. Recuperar metadados não deve rotacionar credenciais repetidamente e causar disputa entre abas.
- Login passará a definir o cookie e retornar os metadados; `/me` recuperará a identidade sem leitura do cookie por JavaScript. Logout deverá revogar no servidor antes de confirmar saída. Definir exclusão de cookie sem permitir que resposta atrasada apague uma sessão mais nova.

### 4. Preservação do isolamento entre usuários

- Manter revisão de sessão, cancelamento, descarte de respostas antigas, limpeza de cache e remontagem dos formulários. Avisos entre abas devem conter somente metadados sem credencial.
- O navegador pode enviar um cookie novo antes que outra aba perceba a troca. O contrato deve vincular cada operação à sessão esperada e rejeitar divergência antes de qualquer escrita; apenas descartar a resposta no frontend é insuficiente.
- Projetar e testar a ordenação de login/logout entre abas, incluindo resposta antiga com `Set-Cookie`. Cancelar uma requisição no JavaScript não desfaz processamento no servidor nem garante impedir atualização de cookie. Escolher o mecanismo de coordenação e recuperação antes do corte definitivo.
- Preservar comportamento de indisponibilidade: ocultar dados durante saída pendente, permitir nova tentativa e não interpretar falha de rede como confirmação de revogação.

### 5. Transição coordenada

- Atualizar frontend e API juntos no corte de autenticação. Planejar um novo login obrigatório e invalidar sessões anteriores por mecanismo explícito, sem apagar usuários/dados clínicos ou trocar senhas.
- Não manter aceitação implícita e indefinida de bearer nas mesmas rotas protegidas por cookie/CSRF. Se surgir necessidade real de cliente externo, definir contrato separado antes de habilitá-lo.
- Atualizar smokes e testes de autorização para o contrato com cookies. Não transportar segredos em argumentos, logs, documentação ou relatórios.
- Antes de atualizar a homologação principal: cópias de banco/exames e comparação de registros/bytes depois. Restaurar versão anterior só com plano compatível de configuração/esquema; não reativar sessões revogadas para facilitar rollback.

## Entregas pequenas e pontos de parada

| Recorte | Trabalho | Aceite e ponto de parada |
|---|---|---|
| 1D.3.2a — transporte | Proxy `/api` pela mesma origem, configuração de origem pública e TLS isolado | Login bearer atual ainda funcional; SPA/reload/API/uploads passam pelo caminho novo; limites do gateway preservados; certificado validado. Commit/push de uma versão funcional |
| 1D.3.2b — contrato testado | Implementar e testar cookie, CSRF, metadados e concorrência em ambiente isolado | Testes negativos e de disputas aprovados; não publicar uma configuração que quebre o frontend atual. Se não houver integração desativada segura, manter trabalho em branch com checkpoint explícito até o corte |
| 1D.3.2c — corte e homologação | Adaptar frontend, remover armazenamento legado, atualizar smokes e ativar contrato completo | Suítes, CI e navegador aprovados; dados preservados; logout/revogação/abas verificados; commit/push e relatório de limitações |

A restrição inicial a um recorte foi substituída pela autorização do usuário em 18/09/2026 para executar a fase inteira, mantendo os checkpoints e critérios acima.

## Matriz de aceite da etapa completa

| Área | Evidência exigida |
|---|---|
| Transporte | HTTPS confiável no navegador; rejeição de configuração HTTP em produção; origem e cabeçalhos forjados rejeitados; API interna sem atalho público |
| Cookie | Flags/escopo/expiração corretos; credencial ausente no JSON e no armazenamento JavaScript; isolamento dos ambientes; teste HTTPS fora da exceção localhost |
| CSRF | Escrita sem token, token forjado, de outra sessão, origem errada/nula e cabeçalhos ausentes rejeitados; login/bootstrap/logout e uploads incluídos; fluxo legítimo aprovado |
| Sessões | Expiração, revogação, troca/reset de senha, inativação e reinício preservados; token legado rejeitado depois do corte |
| Concorrência | Dois usuários/abas, login simultâneo, logout atrasado, resposta com cookie atrasada e escrita de aba desatualizada; nenhum dado ou comando atribuído à pessoa errada |
| Interface | Recarregar página, link direto, reconexão, falha de logout, cache e formulários sem dados da sessão anterior |
| Operação | Smokes e CI atualizados, limites de upload mantidos, cópias e comparação de dados/arquivos, logs sem credenciais |

## Validação da preparação (histórico)

Mapeamento baseado nos arquivos do repositório; referências técnicas consultadas em 17/09/2026. A preparação inicial foi documental. A implementação e homologação posteriores estão concluídas: [evidências da 1D.3.2](./homologacao-etapa-1D3-2.md).
