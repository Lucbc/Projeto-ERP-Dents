# 4B.2 — escrita do atendimento clínico

## Estado

Aceite local aprovado em 28/10/2026, base `e5563fd`; CI remoto pendente. Não ampliar a instalação `piloto-cadastros-v0.1.24`: atualização e recuperação do conjunto clínico permanecem em 4C.

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
| CI remoto | Pendente de publicação e execução integral |

Harness de interface: `scripts/smoke_clinical_writer_browser_homolog.py` e `.cjs`. Usa Chrome, TLS validado, dados fictícios e API/schema/web temporários em `erp-dents-homolog`. Containers principais e volumes preservados. Logs e capturas ficam em `.data`, fora do Git.

## Retomada

Publicar e verificar CI integral; registrar evidências e próximo passo no plano. Depois 4C: ensaiar atualização/backup/restauração com registros clínicos antes de ampliar o piloto. Os guias de instalação permanecem válidos para v0.1.24.

Captura desktop fictícia `.data/homolog/clinical-writer-final.png` inspecionada: contexto atual e contexto finalizado distintos, original preservado e adendo separado, campos de correção legíveis. Os primeiros testes Chrome falharam nos seletores exatos de labels que englobavam controles; os seletores por função/nome acessível corrigiram o harness e o percurso completo passou, sem alteração adicional do produto. Isso não substitui revisão visual em todos os tamanhos de tela.

Evidências locais: `.data/clinical-writer-all-tests.log`, `.data/clinical-writer-api-tests.log`, `.data/clinical-writer-http.log`, `.data/clinical-writer-browser.log`, `.data/clinical-writer-images.log` e `.data/clinical-writer-web-image.log`. Diagnóstico de rede contém somente método/status, sem corpos, cabeçalhos ou credenciais.
