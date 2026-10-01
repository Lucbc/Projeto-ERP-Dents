# Homologação 3A.1 — agenda atualizada entre sessões

Início em 30/09/2026 sobre `8184f83`. Sem migração ou mudança de API. Escopo: consultas da lista e calendário da agenda; painel, fila do dentista e demais recursos permanecem nos próximos recortes de R19.

## Comportamento

- Leitura a cada 15 segundos com página visível/conectada; erro de leitura espaça o intervalo para 60 segundos. Retorno à página, reconexão e botão permitem nova tentativa. Não é garantia de resposta em 15s quando há rede lenta, suspensão ou indisponibilidade.
- Usa o gerenciador de consultas existente, sem polling global. Requisição em andamento é compartilhada; ação manual/foco não cancela para reiniciar a mesma leitura. Mudança de filtro/desmontagem cancela a leitura pelo sinal passado ao cliente HTTP; isolamento de sessão anterior permanece.
- Última leitura bem-sucedida e estado de atualização/conexão visíveis. Falha inicial não vira agenda vazia; falha após sucesso conserva a leitura com aviso. 401/403 oculta dados/formulário, remove cache de consultas e suspende novas leituras naquela página até nova entrada.
- Atualização da lista não troca campos/identidade/versão de formulário ou confirmação. Catálogos não recebem polling; reconexão não recarrega referências enquanto o formulário está aberto, evitando recalcular fim sugerido. Não há reenvio de mutação pelo mecanismo de atualização.

## Validação local

| Camada | Evidência |
| --- | --- |
| Política de leitura | Oito testes com relógio controlado: 15s, pausa/retorno, offline/reconexão, foco, leitura lenta sem sobreposição, falha com dados anteriores, falha inicial/60s, 401/403, cancelamento por filtro/desmontagem |
| Formulários | Dois testes existentes ampliados para lista/calendário: atualização remota e 503 mantêm notas/fim/versão; referências não recarregam, conflito exige revisão e 403 oculta dados. Aprovados |
| Regressão frontend | Primeira execução completa: 128 de 129 passaram. Um teste detectou dois avisos de carregamento; unificados na interface e adaptada ação manual para o botão comum. Depois, 14 testes dos três módulos afetados passaram em 5,66s; complemento de acesso nas duas telas passou em 3,29s. Não contar a primeira execução completa como aprovada |
| Builds | TypeScript/Vite e imagem web aprovados. Aviso de bundle maior que 500kB permanece; otimização geral de carregamento não faz parte desta entrega |
| Chrome inicial | Dois contextos/sessões independentes, HTTPS confiável: criação/reagendamento/cancelamento/exclusão remotos, edição antiga 409 com rascunho mantido, falha 503/recuperação, ausência de escrita automática e pausa de leituras em visibilidade controlada. Aprovado |
| Chrome complementar | Filtros de data da lista e visualização do calendário preservados. Criação remota observada em 15044ms na lista e 14983ms no calendário; oito GETs de lista em cada cenário completo (incluindo tentativas manuais/falhas/recuperação), nenhum durante 17s de visibilidade oculta controlada. Capturas com rascunho e aviso sem modal nos temas claro/escuro inspecionadas e legíveis |
| HTTP | Dez grupos de `smoke_appointment_version_homolog.py` aprovados: pré-condições, conflito entre edições, cancelamento antigo, revisão, vínculos e ausência após exclusão. Reutiliza contrato transacional existente; não houve mudança de banco |

Chrome usa uma sessão autora de requisições e outra receptora na UI, com uma consulta fictícia por cenário, no mesmo computador. Visibilidade/foco são eventos controlados no navegador; não foi ensaio de suspensão física ou carga de várias estações. Componentes verificam reconexão e cancelamento; HTTP/CI devem comprovar regressão do contrato existente. Não acrescentar testes de banco para código de apresentação sem alteração transacional.

## Entrega

Cópias públicas/exames/fingerprints `pre-3A-1*` salvas antes da atualização; helper local `.data/upgrade_3a1.py` compara todas as colunas de negócio, incluindo versões, e bytes dos exames, sem imprimir conteúdo. Apenas `erp-dents-homolog`, dados fictícios e arquivos locais ignorados.

Implementação `f3fbbeb` publicada e HEAD remoto conferido. Cópia integral salva após zero schemas privados; somente web principal atualizada em https://localhost:18443. HTTPS 200 e dez verificações gerais aprovados. Comparação confirmou todas as linhas de negócio e bytes preservados; revisão `0024_user_version`, zero schemas privados e nenhum volume removido. API/banco mantidos.

**Pendente:** resultado do [CI 36769926757](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/36769926757) e fechamento documental. Não repetir validações aprovadas sem nova alteração/falha.

## Manutenção de dependência identificada no CI

O primeiro CI parou na auditoria Python, antes de frontend/backend/HTTP. Auditoria local confirmou PyJWT 2.14.0 afetado por CVE-2026-101918/GHSA-42vr-xj54-vc7v; npm passou. [Aviso oficial](https://github.com/jpadilla/pyjwt/security/advisories/GHSA-42vr-xj54-vc7v) e [release 2.15.0](https://github.com/jpadilla/pyjwt/releases/tag/2.15.0) confirmam a correção do tratamento de payload JSON recursivo.

O ERP verifica assinatura HS256 e não usa `PyJWKClient` nem `verify_signature=False`; a inspeção não identificou o caminho pré-verificação descrito no aviso. Atualização limitada a PyJWT 2.15.0 e seus dois hashes, sem relaxar auditoria. Teste adicional verifica rejeição controlada de payload recursivo assinado com chave fictícia. Auditorias npm/Python após o ajuste aprovadas.

Em 01/10/2026, build API concluído; **17 testes de compatibilidade/sessões/hash legado aprovados em 85,981s**, incluindo rejeição do payload recursivo. Doze grupos HTTP de sessões aprovados, com logout, senhas, inativação/reativação, alteração de perfil e exclusão. Auditorias npm/Python revalidadas e aprovadas.

Correção publicada em `576509d`, HEAD remoto conferido. API principal atualizada para PyJWT 2.15.0, sem migração. Sessão criada antes da substituição foi aceita por HTTPS depois e revogada normalmente; credenciais permaneceram somente em memória no helper local `.data/upgrade_pyjwt_3a1.py`. Dez verificações gerais e comparação de dados/arquivos aprovadas novamente; revisão 0024 e zero schemas privados.

O [segundo CI 36864924883](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/36864924883) aprovou dependências/frontend e parou no build PostgreSQL, antes de backend/HTTP: OpenSSL 3.5.8-r0 não estava disponível. Probe descartável da mesma base confirmou Alpine 3.24 e oferta 3.5.9-r0; pins de libssl3/libcrypto3 atualizados, sem downgrade ou relaxamento da auditoria.

A auditoria local também encontrou CVE-2026-46675 no libpng das imagens web/gateway/edge. Scanner classificou UNKNOWN; a [release oficial 1.6.59](https://sourceforge.net/projects/libpng/files/libpng16/1.6.59/) descreve gravidade média e correção. Pacote 1.6.59-r0 confirmado no repositório e fixado nos dois Dockerfiles Nginx. Quatro imagens construídas; pendentes auditoria, atualização/smoke/preservação, publicação, novo CI e fechamento. Não contar os CIs interrompidos como regressão aprovada.
