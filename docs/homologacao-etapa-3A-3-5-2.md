# Etapa 3A.3.5.2 — matrizes administrativas

Concluída em 09/10/2026. Base `4d7276a`, implementação `ca71526`, ajuste visual `e81d975`. Sem alteração de API, schema ou migração.

## Resultado

- Leitura administrativa com política compartilhada de 15s/60s, pausa/retorno, cancelamento, atualização manual e última leitura identificada. Falha inicial não significa matriz vazia; falha posterior identifica os dados antigos.
- Aviso de versão remota inclusive no perfil recolhido. Cada rascunho e versão capturada permanecem intactos; recarga explícita substitui somente o perfil escolhido. Salvar ainda envia a versão capturada, sujeita à rejeição do servidor; conflito/resultado incerto exige revisão explícita. Nenhuma escrita automática.
- Negação administrativa desmonta matrizes, cancela leituras e ignora recargas/respostas tardias. Limpeza limitada a `permissions/roles`, preservando leitor global `permissions/me`.
- Capturas identificaram contraste inadequado do aviso de revisão no tema escuro; correção local validada nos temas claro/escuro.

## Evidências por camada

| Camada | Resultado |
| --- | --- |
| Componentes | 268 testes locais/33 arquivos antes do caso adicional; seis casos focados finais aprovados. CI final 269 frontend. Cobertura de relógio/pausa/retorno/cancelamento, falhas/60s, rascunhos/versões, recarga independente, revisão após polling e negação sem apagar permissões efetivas ou aceitar resposta tardia |
| API/banco | CI final 302 backend e regressões HTTP aprovados; rejeição 409 e revogação 401 reais também exercidas pelo Chrome. Banco real da homologação preservado; revisão `0024_user_version`, zero schemas `test_%` |
| Interface | Chrome com duas sessões independentes: atualização remota em 14540ms, rascunhos/versões mantidos, recarga somente do perfil escolhido, 409 real, falha de recarga e leitura/recuperação, pausa oculta, negação administrativa simulada 403, revogação real de sessão e somente duas escritas explícitas na sessão observadora. Capturas finais claro/escuro inspecionadas |
| Regressão | Harness anterior de duas abas aprovado: conflito de versão, falha/recarga, rascunhos independentes e sessão revogada. Não confundir 403 simulado da interface com teste real de autorização, coberto no backend/HTTP |
| Build/segurança | TypeScript/Vite final 10,35s e imagem web aprovados. npm/Python e seis imagens sem achados; aviso existente de bundle acima de 500kB permanece |
| CI | [37942637860](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/37942637860) aprovado no código final `e81d975`; CI inicial `37942480898` cancelado/superado. Commits seguintes apenas documentais |

## Atualização e preservação

Somente web de `erp-dents-homolog` atualizada após aceites locais enquanto CI rodava isolado; conclusão aguardou aprovação do CI. HTTPS confiável retorna 200 e JS/CSS servidos correspondem ao build validado. Dez verificações integradas aprovadas; comparação antes/depois confirmou linhas de negócio, referências históricas e bytes de exames preservados. Nenhum volume removido; demais serviços não reiniciados.

Backups locais `pre-3A-3-5-2*` preservados. Helper `.data/upgrade_3a352.py`: usar somente `after`; não sobrescrever `before/full`. A tentativa de tag da imagem web anterior encontrou ID ausente no armazenamento local: não há tag `pre-3a352`; reconstrução do código `4d7276a` permanece possível. Nenhum segredo ou dado local publicado.

Logs/capturas ignorados: `.data/ci-final-3a352.log`, `.data/tests-3a352-full.log`, `.data/tests-3a352-additional.log`, `.data/browser-3a352-final.log`, `.data/browser-version-3a352.log`, `.data/audit-images-3a352-final.log`, `.data/smoke-main-3a352.log`, `.data/homolog/permission-refresh-*.png`.

## Próximo passo e limites

3A.3.6 — exames e cabeçalho do paciente, conforme [contrato](./plano-etapa-3A-3.md). R19 permanece parcial; referências gerais em 3A.3.7. Chrome no mesmo computador não comprova múltiplas estações físicas, capacidade ou outros navegadores; instalação assistida permanece na etapa 5. Não repetir validações aprovadas sem mudança/falha.
