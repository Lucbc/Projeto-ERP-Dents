# U1.6 — prevenção de cadastros duplicados

Este documento registra o aviso entregue na v0.1.6. A proteção de CPF na gravação, incluindo inativos e preservação dos históricos, está documentada na [U1.6C](./ATUALIZACAO-U1-6C.md).

## U1.6B — concluída, versão consolidada em 18/10/2026

Liberada em `piloto-cadastros-v0.1.6`. Código funcional `c850498`, imagens corrigidas `de20ba1`. [CI 39036439232](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/39036439232) aprovado: 311 testes backend e 398 frontend, builds, regressões HTTP e auditorias. Log ignorado `.data/duplicates-ci-final.log`.

Aviso automático no formulário de novo paciente após informar CPF completo ou nome completo/nascimento. Consulta exata no banco inteiro, incluindo inativos; nome ignora acentos, caixa e espaços repetidos. CPF compara 11 dígitos com pontuação opcional, sem converter texto misto em documento. Não valida dígitos verificadores nem impede gravação simultânea.

`POST /api/patients/duplicate-check` é somente leitura, exige permissão de visualizar pacientes e retorna apenas ID, nome, nascimento, situação e motivo, total e até dez candidatos. Não retorna CPF, contato ou informações clínicas. Corpo evita colocar os critérios na URL. A resposta informa se havia critérios suficientes; ausência de correspondência não prova inexistência.

Interface preserva rascunho, consulta após pausa na digitação, cancela ao fechar/trocar campos e ignora respostas antigas mesmo quando o transporte não respeita cancelamento. Falha mostra aviso e nova tentativa; 401/403 encerra a visualização. Cadastro legítimo continua disponível. Não há consulta na edição nem alterações automáticas em registros existentes.

Validação até este checkpoint:

- PostgreSQL privado aprovado, 3,866 s: busca além dos primeiros 100, correspondência exata, inativos, ausência de CPF, documentos mistos, negativos, limite/total e preservação. `.data/duplicates-db.log`.
- Build API/web e TypeScript aprovados; `.data/duplicates-build.log`. Último ajuste da condição SQL para CPF misto validado no banco após esse build.
- Chrome/API aprovado: aviso, conta de recepção, resposta mínima, alteração de critérios, rascunho, ausência de CPF, regressões e recusa 403 após revogar visualização. `.data/duplicates-browser.log`.
- Suíte frontend aprovada: 398 testes/45 arquivos, 134,50 s. Cinco casos novos cobrem critérios incompletos, candidatos, falha/retentativa, resposta antiga e permissão revogada. A primeira execução focada revelou falta de limpeza entre testes; corrigido isolamento do teste antes da suíte completa. `.data/duplicates-frontend.log`.
- Código `c850498`: primeiro ensaio de atualização v0.1.5 → pacote aprovado em 68,72 s, preservando todas as tabelas, exame, sessão, volumes/configuração/TLS e validando consulta de duplicidade sem escrita. `.data/duplicates-update.log`. Esse tempo exclui build/download e não dimensiona a clínica.

### Correção adicional de construção das imagens

CI `39036157289` aprovou frontend, mas parou no build Nginx: o pin `libexpat=2.8.5-r0` não estava mais disponível. [Índice oficial Alpine v3.24](https://pkgs.alpinelinux.org/package/v3.24/main/x86_64/libexpat) e `apk policy` no mesmo digest base confirmaram `2.9.0-r0`; atualizado em `ops/nginx/Dockerfile` e `apps/web/Dockerfile`, código `de20ba1`. Build local de web/gateway/edge aprovado; `.data/duplicates-runtime-build.log`.

Novo CI `39036439232` e ensaio incluindo proxies aprovados. Auditoria local das seis imagens aprovada, sem achados reportados (`.data/duplicates-runtime-audit.log`). Sem mudança de configuração, dependências Python/JS ou esquema. A versão antiga pode falhar numa construção nova sem cache; tags antigas preservadas. O roteiro da nova versão reconstrói API, web, gateway e edge.

Limitação do ensaio adicional: primeira tentativa parou antes do aceite porque as imagens originais dos proxies ativos não estavam no catálogo Docker local. Nenhum volume removido. Com a biblioteca antiga indisponível para download, o ensaio usa proxies corrigidos tanto com a API antiga quanto com a nova; não comprova troca da imagem antiga de proxy. Confere imagens e versão da biblioteca, HTTPS/TLS e preservação nas duas fases. Log da tentativa `.data/duplicates-update-runtime.log`; execução ajustada `.data/duplicates-update-runtime-final.log`.

Ensaio ajustado aprovado: 115,31 s de manutenção, backup restaurado e todas as tabelas iguais, versões de imagens/biblioteca conferidas, dados/exame/sessão/volumes/configuração/TLS preservados, consulta de duplicidade sem escrita, edição e novo login aprovados. Recursos privados removidos, volumes de ensaio preservados. Esse aceite é HTTP; Chrome foi validado separadamente. Não é instalação física na clínica.

## U1.6A — diagnóstico concluído em 16/10/2026

Base `f00d889`, aplicação da versão `piloto-cadastros-v0.1.5`. Nenhuma alteração funcional nesta subetapa; versão de instalação preservada.

### Evidência reproduzida

`scripts/diagnose_patient_duplicates_homolog.py` dentro da API, com `RUN_HOMOLOG_TESTS=1`, usa a fixture de schema exclusivo de `erp-dents-homolog`. Dados exclusivamente fictícios; o diagnóstico imprime apenas resultados, remove seu schema e preserva os volumes. Log local ignorado `.data/patient-duplicates-diagnosis.log`.

| Caso | Resultado atual |
| --- | --- |
| Criar duas pessoas com CPF equivalente, com/sem pontuação | Ambos aceitos; a busca normalizada encontra os dois |
| Editar um terceiro cadastro para o mesmo CPF | Aceito; os dois registros anteriores permanecem intactos |
| Criar simultaneamente em duas conexões com o mesmo CPF | Ambos aceitos |
| Mesmo nome, nascimentos diferentes, sem CPF | Ambos aceitos; esse caso legítimo precisa continuar permitido |

Foi executado caso de uso + repositório + PostgreSQL real em schema privado. **Não é teste HTTP nem de interface.** Não se trata de teste de regressão exigindo que o defeito permaneça: o script é diagnóstico histórico explícito, fora da descoberta automática de testes.

### Causa verificada por leitura

- `PatientUseCases` remove espaços nas pontas do CPF, sem verificar equivalência ou duplicidade.
- Coluna `patients.cpf` tem índice comum, sem unicidade; a busca normalizada não impede gravações repetidas.
- O formulário envia a criação/edição sem conferência de possíveis duplicados. CPF continua opcional.
- Nome igual, telefone compartilhado e ausência de CPF não identificam uma pessoa de forma suficiente para bloquear cadastro ou mesclar registros.

## Escopo original da U1.6B — atendido

Implementar aviso não bloqueante de possível duplicidade, inicialmente por CPF equivalente completo e/ou nome completo com nascimento igual. Mostrar apenas dados necessários para conferência, respeitando permissão de visualizar pacientes. Não comparar só os primeiros 100 registros nem usar a busca genérica como prova de correspondência exata. Não sinalizar o próprio registro numa futura extensão para edição.

Critérios: conferir cadastro existente, permitir homônimos legítimos e ausência de CPF, preservar rascunho, descartar resposta de consulta antiga quando o formulário mudar, não afirmar ausência de duplicidade se a consulta falhar, não gravar/mesclar automaticamente. Validar componentes, HTTP/banco e Chrome com conta de recepção. Nenhuma alteração de regra de bloqueio nesta primeira parte.

## Recorte posterior — proteção de CPF na gravação

Antes de bloquear CPF equivalente, definir tratamento de CPF inválido/histórico, inativos e duplicidades existentes. Inspecionar somente contagens em ambiente autorizado, sem exportar documentos ou dados pessoais. Não adicionar índice único que impeça a atualização de uma instalação com duplicados, nem alterar/remover CPF histórico automaticamente.

Uma consulta prévia isolada não resolve duas gravações simultâneas. A proteção deve garantir atomicidade no banco, retornar conflito compreensível e preservar o rascunho, cobrindo criação e edição. Planejar migração e ensaio de atualização próprios se necessários; não condicionar a instalação do piloto a esse recorte.

## Retomada

U1.6B concluída e versão v0.1.6 liberada para instalação assistida de cadastros. Próximo recorte: proteção de CPF na gravação, com tratamento de históricos e concorrência; aviso atual não substitui essa proteção. Consultar antes de cadastrar continua necessário. Ao receber os dados do computador da clínica, priorizar instalação física P3.
