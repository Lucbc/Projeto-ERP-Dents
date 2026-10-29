# 4C.2 — backup completo e aplicação restaurada

## Escopo e estado

Concluída em 29/10/2026, base `8cf9e43`, código `4eb6ef5`; aceite local e CI remoto aprovados. Complementa o aceite de migração/banco da [4C.1](./homologacao-etapa-4C-1.md) com o script Windows de backup, arquivos de exames, configuração, TLS e acesso à aplicação restaurada. Dados exclusivamente fictícios em `erp-dents-homolog`; containers e volumes principais preservados. A instalação permanece v0.1.24 até consolidar a liberação e os guias.

## Mudanças

- `backup-server.ps1` aceita `-HomologFixture` somente com `-Environment homolog`. A descrição deve estar sob `.data/homolog`, com identificador aleatório, banco/container/volume temporários com nomes vinculados a esse identificador. Confere labels, banco da API, montagem de exames igual à instalação, projeto/volume do PostgreSQL e ausência de outros usuários do volume de exames antes da manutenção.
- O modo temporário executa o mesmo processo de ACL, manutenção, dump, arquivo de exames, cópia de configuração/TLS e manifesto. Para o teste, para/reinicia somente a API privada. Sem esse parâmetro, mantém a descoberta por Compose e os destinos usuais. O parâmetro não faz parte dos comandos da clínica.
- Harness `scripts/smoke_clinical_full_recovery_homolog.py` cria banco e volume de origem privados, grava rascunho/evolução finalizada/adendo e envia um PNG fictício pela API com antivírus. Executa o script PowerShell real; restaura em outro banco/volume, usando a configuração e os certificados copiados. Credenciais ficam em pasta local com ACL restrita, fora do Git.
- Harness Chrome `.cjs` usa TLS validado, login restaurado, histórico/contexto/adendo e edição de rascunho. Não imprime credenciais, corpos de requisições ou conteúdo clínico.

## Critérios de aceite

| Camada | Verificação |
| --- | --- |
| Destino | Rejeitar ambiente de produção e referência a container principal no modo de fixture antes da manutenção |
| Backup Windows | API privada reinicia; `INCOMPLETE` removido somente após sucesso; manifesto contém dump, exames, configuração e certificados com SHA-256 correto |
| PostgreSQL | Todas as linhas restauradas têm quantidades/hashes iguais à origem; recuperação da tentativa clínica não duplica registros/adendos/recibos |
| Arquivos | Todos os arquivos extraídos coincidem com os hashes do arquivo de exames; download do exame original e de novo upload coincide byte a byte com o PNG fictício |
| API/HTTPS | Login dos usuários restaurados, leitura clínica, repetição da tentativa, leitura/gravação de exames e reinício aprovados usando a configuração/certificados copiados |
| Chrome | Login, histórico original/adendo/contexto e gravação de rascunho restaurado; nova leitura pela API após reinício confirma persistência |
| Preservação | Origem e banco principal sem alteração; somente bancos/containers temporários removidos, volumes mantidos |

Todos os critérios acima passaram na execução final. A captura desktop do editor restaurado foi inspecionada: identificação do paciente/consulta, alergia, autoria e rascunho salvo legíveis. A conferência por API após reinício confirmou o texto gravado no Chrome e os bytes do novo exame. A comparação SQL é independente da validação de interface. O modo padrão de produção não foi executado sobre os containers principais; seu caminho de Compose foi preservado na revisão do diff. O teste Windows exercita o fluxo de backup com destinos privados e não depende do CI Linux para provar esse comportamento.

[CI 40879673431](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/40879673431) aprovado no código `4eb6ef5`: 517 testes frontend, 368 backend em 838,833 s, builds e regressões HTTP. Auditoria das imagens `api`, `web`, `gateway`, `edge`, `db` e `clamav`: `{}`; base de vulnerabilidades atualizada em 29/10/2026 às 13:09:46 UTC. Log local `.data/clinical-full-recovery-ci.log`. A consolidação posterior altera somente documentação.

## Evidências e reprodução

Log local `.data/clinical-full-recovery.log`, resumo `.data/homolog/last-clinical-full-recovery.json` e captura `.data/homolog/clinical-full-recovery.png`. Backups e configurações efêmeras ficam na pasta protegida `.data/homolog/full-recovery-<identificador>`. Os volumes de teste são mantidos, nunca removidos para contornar erros. Não enviar essas pastas ou backups ao Git.

Pré-requisitos técnicos: Windows, Docker de homologação ativo, imagens atuais `erp-dents-homolog-api` e `erp-dents-homolog-web`, Python, Chrome/Playwright e porta 18444 livre. Executar `python scripts/smoke_clinical_full_recovery_homolog.py` com `PLAYWRIGHT_MODULE` apontando para o módulo local. Não executar em paralelo com outros harnesses que usem 18444. Não é um comando de instalação da clínica.

A primeira tentativa revelou duas diferenças na preparação do teste: nome DNS temporário longo demais e montagem da origem de exames em um nível diferente do Compose. Corrigidos os nomes e a montagem; a validação do script agora rejeita essa montagem incorreta antes do backup. O aceite exige execução completa com a preparação corrigida.

## Próximo passo

Guia de uso preparado em [Prontuário clínico](./PRONTUARIO-CLINICO.md), identificado como destinado à próxima versão. O guia de backup registra o ensaio privado; os dois comandos ainda antigos no roteiro de atualização foram alinhados à v0.1.24 já liberada. Nenhuma dessas mudanças publica uma nova versão de instalação.

Consolidar a liberação de instalação após os aceites 4C.1/4C.2: atualizar guias de atualização/recuperação para a migração 0026, explicar a concessão explícita de acesso clínico e a preservação do original por adendos, preparar a versão e verificar o pacote. Não orientar downgrade destrutivo com prontuários existentes. A instalação física continua prioritária quando chegarem os dados do servidor.

**Retomada do pacote (4C.3):** `git merge-base --is-ancestor piloto-cadastros-v0.1.24 HEAD` retornou falso: a manutenção foi publicada em `release/pilot-v0.1.24` (`220117f`/`aedbde0`) separada da `main`. O verificador de atualização exige ancestralidade. Incorporar essa branch por merge revisado, preservando os módulos clínicos e conferindo dependências/guias, antes de criar a próxima tag; não contornar o verificador nem usar force push. Conferir a atualização a partir da tag instalada. Essa integração ainda não foi executada nesta subetapa.

Prévia sem alterar a árvore de trabalho (`git merge-tree --write-tree --name-only main release/pilot-v0.1.24`) encontrou conflito apenas em `docs/PLANO-DE-EXECUCAO.md`; conferir novamente ao integrar e preservar o ponto de retomada mais recente junto ao histórico da manutenção. A prévia não substitui merge, validação ou publicação.
