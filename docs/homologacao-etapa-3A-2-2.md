# Homologação 3A.2.2 — consulta do dentista atualizada

Início em 02/10/2026, base `e78a0a3`. [Contrato e aceite](./plano-etapa-3A-2.md). Sem migração ou mudança do contrato HTTP; sem ampliar acesso clínico, lista de pacientes ou regras de próxima consulta.

## Comportamento

- Próxima consulta, pacientes com busca atual e detalhe selecionado atualizam independentemente: 15s visível/conectado, 60s após falha, retorno/reconexão/manual e estado/timestamp por seção. Nenhuma escrita automática. Detalhe não montado não faz leitura.
- Busca/seleção ficam fora dos dados recebidos; outra próxima consulta não troca paciente escolhido. Chaves incluem identidade/vínculo e filtro/seleção; sinais cancelam leituras antigas e cache clínico é descartado ao desmontar. Mudança de identidade/vínculo reinicia estado local.
- Falha inicial não significa fila/lista vazia. Falha transitória preserva última leitura com aviso, inclusive detalhe; `null` válido da próxima consulta tem timestamp de sucesso.
- Detalhe 404 oculta dados anteriores e remove cache daquele registro. Pausa intervalo/foco/reconexão até verificação manual; nova falha transitória continua sem dados antigos, novo sucesso retoma intervalo sem leitura duplicada imediata. Fechar/selecionar outro paciente é explícito. Sem seleção automática substituta.
- Qualquer 401/403 clínico bloqueia todas as seções e remove cache de consultas; sessão ainda segue tratamento global. Verificação de permissões fica montada mesmo quando os dados estão ocultos; falha desconhecida bloqueia conteúdo até recuperação. Rota continua limitada a dentista e conta sem vínculo recebe orientação sem chamadas clínicas. Somente o guard de permissão estático interno foi substituído; guard de perfil/autenticação continua.
- Lista permanece limitada a 100/offset 0, informa exibidos/total e pede refinar busca quando truncada. Não promete paginação completa. Próxima consulta continua usando início >= agora e excluindo canceladas, conforme servidor; consultas já iniciadas não viram atendimento em andamento neste escopo.

## Evidências

| Camada | Resultado |
| --- | --- |
| Componentes | 12 testes novos: seleção/busca e atualização independente, falha inicial/null, 503 com detalhe, 404/manual/recuperação sem duplicata, 401/403 global, permissões/recuperação, cancelamento por busca/seleção, identidade/vínculo, truncamento e perfil/sem vínculo |
| Regressão frontend | 153 testes em 24 arquivos aprovados em 87,34s, incluindo política compartilhada, painel e agenda |
| Builds | TypeScript/Vite e imagem web aprovados; aviso existente de bundle >500kB permanece |
| HTTP | Seis grupos de `smoke_consultation_refresh_homolog.py` aprovados, além do harness de bootstrap/reinício/limpeza: escopo entre dentistas e parâmetro alheio, busca/lista/ausência, reagendamento/cancelamento/exclusão, início passado, autorização e ausência de vínculo. Incluído no CI |
| Banco | Sem migração ou alteração transacional. HTTP usa schema privado no banco exclusivo da homologação; fixtures de início passado e usuário legado sem vínculo ajustadas via SQL privado. Não alterado relógio do servidor; não confundir fixture passada com espera real de passagem do tempo |
| Chrome | Aprovado: sessão administrativa autora e dentista receptora; detalhe atualizado em 15229ms, 19 GETs clínicos no cenário completo, nenhuma escrita automática. Busca/seleção preservadas, reagendamento/cancelamento/exclusão, 503/recuperação, pausa de 17s ocultos, 404 sem dados antigos ou leitura automática, verificação manual e revogação aprovados. Capturas claro/escuro inspecionadas e legíveis |

Primeira execução focada teve 25/32 aprovados: seis expectativas precisavam aguardar a montagem após resposta de permissão; uma revelou duplicação real da leitura de detalhe ao reativar a política após recuperação manual. Ajustado harness e frescor opt-in do detalhe; suíte inteira final aprovada. Não contar primeira execução como aprovação.

## Entrega e pendências

Cópias públicas/exames/fingerprints e dump integral `pre-3A-2-2*` salvos, helper `.data/upgrade_3a22.py`, dump após zero schemas; dados exclusivamente fictícios em `erp-dents-homolog`. Somente web principal atualizada, dez verificações gerais aprovadas e comparação confirmou linhas de negócio/histórico/bytes preservados. Sem migração, revisão 0024 e nenhum volume removido. Logs/capturas/credenciais ignorados pelo Git.

Chrome usa duas sessões no mesmo computador e eventos controlados de visibilidade; massa de dois pacientes/consultas, não ensaio físico de estações/capacidade da clínica. Métrica conta leituras clínicas no cenário com várias ações, não requisições por intervalo estável.

Implementação `2500b01` publicada, HEAD remoto conferido. [CI 37022048989](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/37022048989) aprovou 302 testes backend em 729,534s, 153 frontend, builds e regressões HTTP, mas falhou na auditoria das imagens. Não contar essa execução como aprovação integral.

### Manutenção de segurança — 02/10/2026

- Auditoria local reproduziu dois achados em web/gateway/edge/ClamAV: `pcre2` 10.48-r0 (CVE-2026-103111, alta) e `nghttp2-libs` 1.69.0-r0 (CVE-2026-58055, média). Repositório Alpine da imagem confirmou disponibilidade das correções 10.49-r0/1.70.0-r0; versões fixadas nos Dockerfiles, sem exceção no auditor.
- Web/proxies mantêm correções anteriores e digest-base. Novo `ops/clamav/Dockerfile` mantém digest-base, entrypoint e caminhos de dados; os três Compose passam a construir essa imagem corrigida. Nenhuma alteração de política de detecção, saúde, assinatura ou volumes.
- Quatro imagens construídas; auditoria local final sem achados nas seis imagens. Somente web/gateway/edge/ClamAV atualizados na homologação. Saúde/recarga do antivírus, dez verificações gerais, HTTPS/cookies/CSRF/sessões, regressões de exames e limites do proxy aprovados. Proxy: 80 requisições/oito workers, p95 2,094s, corpo lento 30,047s; não ensaio de carga da clínica.
- Cópias públicas/exames/fingerprints/dump integral `pre-3A-2-2-infra*`, helper local `.data/upgrade_infra_3a22.py`. Comparação final confirmou linhas de negócio/histórico/bytes preservados. Revisão `0024_user_version`, zero schemas privados, nenhum volume removido. Logs e cópias ignorados pelo Git.
- Manutenção publicada em `f40bde9`, HEAD remoto conferido. [CI final 37050828988](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/37050828988) aprovado em 02/10/2026, 21min02s: **302 backend em 718,066s/153 frontend**, builds, regressões HTTP e auditorias aprovados; seis imagens sem achados.

## Fechamento — 02/10/2026

Critérios de 3A.2.2 verificados nas camadas acima; 3A.2 concluída com painel e consulta do dentista. Homologação em `https://localhost:18443`, HTTPS confiável aprovado, dados/arquivos preservados e nenhuma migração. Evidência de interface vem dos testes de componentes e Chrome; evidência HTTP e auditoria não substituem ensaio de usabilidade/capacidade da clínica. Aviso de bundle >500kB e limite de 100 pacientes permanecem.

Próximo: preparar 3A.3, demais telas e permissões efetivas, com contrato e aceite por recurso. R19 continua parcial; não iniciar atualização universal nem alterar formulários abertos sem avaliar suas dependências. Fechamento documental publicado separadamente após o CI, sem repetir runtime aprovado.
