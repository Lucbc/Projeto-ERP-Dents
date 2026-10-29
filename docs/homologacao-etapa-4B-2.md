# 4B.2 — escrita do atendimento clínico

## Estado

Concluída e conferida em 29/10/2026, base `e5563fd`, produto `587f994`. Aceite local e CI remoto aprovados. Não ampliar a instalação `piloto-cadastros-v0.1.24`: atualização e recuperação do conjunto clínico permanecem em 4C.

## Implementação

- Seleção explícita de consulta do paciente e do dentista vinculado, com horário e situação. Abrir a tela não cria registro. A busca direta por consulta reabre o registro existente, independentemente da paginação do histórico.
- Rascunho editável somente pelo autor com permissão; finalização explícita do texto já salvo; correções por adendo com motivo, preservando o original e o contexto registrado na finalização.
- Criação pela interface envia paciente esperado e versão da consulta. O servidor confere ambos sob bloqueio transacional, impedindo que uma consulta reassociada receba texto do paciente anterior. Chamadas antigas sem esse par mantêm o contrato e o hash dos recibos existentes.
- Texto local separado da versão do servidor. Conflito mantém o texto e exige carregamento explícito antes de outra gravação. Resposta perdida mantém ação, alvo, chave, versão e corpo da tentativa; recuperação reutiliza exatamente esses dados. Após confirmação, consulta a versão atual para que um recibo antigo não substitua alterações posteriores.
- Avisos ao fechar/navegar com texto não salvo e ao recarregar a página. Tentativa desconhecida bloqueia outra gravação e saída interna até recuperação. Textos e tentativas ficam somente em memória; fechar forçadamente o navegador não fornece recuperação persistente do rascunho local.
- Perda de escrita preserva o texto sem permitir salvar; perda de leitura/sessão oculta o conteúdo. Leitura do contexto cadastral continua com suas permissões anteriores. Nenhuma concessão clínica automática para administradores.

## Validação

| Camada | Resultado local |
| --- | --- |
| Componentes | 18 testes focados aprovados, incluindo 9 novos do editor |
| Frontend integral | 517 testes em 52 arquivos aprovados; TypeScript/build e imagem web aprovados |
| Backend clínico | 32 testes de domínio, schemas e PostgreSQL aprovados |
| HTTP + PostgreSQL | Lookup sem registro/com registro, autorização/revogação e rejeição de paciente/versão divergentes aprovados; rejeições não criam registro ou recibo |
| Chrome | Criação e adendo com resposta perdida/repetição exata, salvar/reabrir, conflito entre duas abas, finalização explícita, leitor independente sem escrita, consulta reassociada e revogação de escrita/leitura aprovados |
| PostgreSQL após Chrome | Um registro finalizado na versão 5, texto/autor/paciente/consulta/contexto preservados, um adendo e cinco recibos. A tentativa com consulta reassociada não criou registro nem recibo |
| CI remoto | [40799671459](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/40799671459), código `587f994`: 517 frontend, 368 backend em 632,388 s, builds e regressões HTTP aprovados; auditorias de dependências e seis imagens sem achados |

Harness de interface: `scripts/smoke_clinical_writer_browser_homolog.py` e `.cjs`. Usa Chrome, TLS validado, dados fictícios e API/schema/web temporários em `erp-dents-homolog`. Containers principais e volumes preservados. Logs e capturas ficam em `.data`, fora do Git.

## Retomada

4C: ensaiar atualização/backup/restauração com registros clínicos antes de ampliar o piloto. Os guias de instalação permanecem válidos para v0.1.24. O código funcional já foi publicado; a consolidação posterior altera somente documentação.

Captura desktop fictícia `.data/homolog/clinical-writer-final.png` inspecionada: contexto atual e contexto finalizado distintos, original preservado e adendo separado, campos de correção legíveis. Os primeiros testes Chrome falharam nos seletores exatos de labels que englobavam controles; os seletores por função/nome acessível corrigiram o harness e o percurso completo passou, sem alteração adicional do produto. Isso não substitui revisão visual em todos os tamanhos de tela.

Evidências locais: `.data/clinical-writer-all-tests.log`, `.data/clinical-writer-api-tests.log`, `.data/clinical-writer-http.log`, `.data/clinical-writer-browser.log`, `.data/clinical-writer-images.log` e `.data/clinical-writer-web-image.log`. Diagnóstico de rede contém somente método/status, sem corpos, cabeçalhos ou credenciais.

CI registrado em `.data/clinical-writer-ci.log`. Imagens `api`, `web`, `gateway`, `edge`, `db` e `clamav`: `{}`. Base de vulnerabilidades atualizada em 29/10/2026 às 01:22:22 UTC. Não repetir aceites aprovados sem alteração, falha ou dúvida concreta.

### Preparação da 4C (ainda não executada)

- Partir de cópia isolada e fictícia da versão de instalação com migração 0025; registrar hashes das tabelas e dos arquivos de exames antes de migrar para 0026. Não atualizar os containers principais para produzir a evidência.
- Conferir preservação dos módulos existentes e negação inicial das permissões clínicas. Criar rascunho, finalização e adendo com credenciais efêmeras em ambiente privado.
- Gerar backup completo desse conjunto e restaurar em novo banco/volume; conferir todas as tabelas, arquivos, contexto/autoria/versões e recibos. Manter os volumes, conforme regra do projeto.
- Após restauração, testar leitura/escrita autorizadas e recuperação de uma chave já gravada, sem duplicação. Verificar API e navegador separadamente da comparação SQL.
- Reaproveitar os mecanismos de `smoke_backup_restore_homolog.py` e `restore_application_homolog.py`, mas adaptar o isolamento: atualmente leem a base principal de homologação e imagens dos containers principais. Não executar esses scripts sem preparar a origem representativa e confirmar as imagens corretas.
- Só depois desses aceites avaliar a nova versão de instalação e atualizar os guias. O pacote v0.1.24 permanece a referência até lá.
