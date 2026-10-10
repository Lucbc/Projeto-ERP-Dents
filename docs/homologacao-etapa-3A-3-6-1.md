# Etapa 3A.3.6.1 — isolamento dos exames por paciente

Concluída em 09/10/2026, implementação `8803d05`/`5d4d2c5`, após a [preparação](./plano-etapa-3A-3-6.md). Sem alteração de API/schema.

## Resultado

- Conteúdo da página delimitado pelo ID do paciente: arquivo/notas/progresso/revisão/ações não passam para outro paciente na mesma rota.
- Desmontagem aborta upload, leituras, prévias e downloads pendentes. Callbacks de upload antigos não mostram avisos, atualizam progresso nem resetam o novo formulário; leituras de paciente/lista/política propagam AbortSignal.
- Download cancelado não inicia arquivo tardio e mantém anexo octet-stream. Prévia restrita a PNG/JPEG ignora resultado antigo e libera URL ao sair. Arquivo já entregue ao computador não é revogado pela aplicação.
- Cancelamento não presume rollback no servidor. Retorno ao paciente lê cabeçalho/lista mesmo com cache recente. Polling, cabeçalho com estados independentes e revogação específica continuam na 3A.3.6.2.

## Diagnóstico que orientou a correção

Dois probes de componentes inicialmente reproduziram arquivo/notas passando de A para B e sucesso tardio de upload apagando o rascunho de B. Substituídos por regressões permanentes que exigem isolamento.

Chrome revelou uma lacuna adicional: o cache global de 15s evitava nova leitura ao voltar rapidamente para A depois de upload confirmado no servidor e resposta cancelada. Corrigido com `refetchOnMount: always`; testes passaram a usar o frescor real e verificam três leituras em A/B/A. Tentativas intermediárias do harness ficaram registradas localmente, sem declarar sucesso antes da execução final.

## Evidências por camada

| Camada | Resultado |
| --- | --- |
| Componentes | 276 testes/34 arquivos locais (49,80s); após complemento de cache, 22 focados (4,60s) e CI completo final 276 aprovados. Casos: A/B/A, erro/progresso/sucesso tardios, cancelamento de bytes/leituras, URL liberada e exclusão antiga sem fechar confirmação nova. Adaptador verifica sinal composto realmente abortado, não identidade entre objetos AbortSignal |
| Interface/API | Chrome: troca do parâmetro no mesmo documento, upload gravado no servidor com resposta retida, aborto ao navegar, rascunho de B preservado e resultado real em A ao retornar. Regressão incorporada: bytes exatos de download, prévia, exclusão em duas abas/404, recarga/nova confirmação e rascunho de upload preservado. Capturas finais de revisão/conclusão inspecionadas |
| Backend/banco | CI final 302 testes backend e regressões HTTP aprovados; schema privado removido, sem migração nova. Banco principal de homologação na revisão `0024_user_version`, zero schemas `test_%` |
| Build/segurança | TypeScript/Vite final 11,25s e imagem web aprovados; npm/Python aprovados. Seis imagens sem achados no CI final. Aviso existente de bundle acima de 500kB permanece |
| CI | [37978598105](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/37978598105) aprovado no código final `5d4d2c5`. CI inicial `37978082043` cancelado/superado; commits seguintes documentais |

## Atualização e preservação

Somente web de `erp-dents-homolog` atualizada após aceites locais enquanto CI rodava isolado; conclusão aguardou CI. HTTPS confiável retorna 200, JS/CSS correspondem ao build final e dez verificações integradas passaram. Comparação antes/depois confirmou linhas de negócio, referências históricas e bytes de exames preservados. Nenhum volume removido nem demais serviços reiniciados.

Backups locais `pre-3A-3-6-1*` preservados. Helper `.data/upgrade_3a361.py`: somente `after`, não sobrescrever `before/full`. Nenhum segredo, dado local ou log publicado.

Evidências locais ignoradas: `.data/tests-3a361-full.log`, `.data/tests-3a361-return.log`, `.data/build-3a361-final.log`, `.data/browser-3a361-final.log`, `.data/ci-final-3a361.log`, `.data/smoke-main-3a361.log`, `.data/homolog/exam-deletion-review.png` e `exam-deletion-complete.png`.

## Retomada e limites

Próximo: **3A.3.6.2**, leituras remotas/cabeçalho/revogação, conforme [plano específico](./plano-etapa-3A-3-6.md). 3A.3.6 e R19 permanecem parciais. Não repetir testes aprovados sem mudança/falha; Chrome no mesmo PC não comprova capacidade/múltiplas estações físicas/outros navegadores. Instalação assistida permanece na etapa 5.
