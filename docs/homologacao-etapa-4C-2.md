# 4C.2 — backup completo e aplicação restaurada

## Escopo e estado

Aceite local aprovado em 29/10/2026, base `8cf9e43`; CI remoto pendente. Complementa o aceite de migração/banco da [4C.1](./homologacao-etapa-4C-1.md) com o script Windows de backup, arquivos de exames, configuração, TLS e acesso à aplicação restaurada. Dados exclusivamente fictícios em `erp-dents-homolog`; containers e volumes principais preservados. A instalação permanece v0.1.24 até consolidar a liberação e os guias.

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

## Evidências e reprodução

Log local `.data/clinical-full-recovery.log`, resumo `.data/homolog/last-clinical-full-recovery.json` e captura `.data/homolog/clinical-full-recovery.png`. Backups e configurações efêmeras ficam na pasta protegida `.data/homolog/full-recovery-<identificador>`. Os volumes de teste são mantidos, nunca removidos para contornar erros. Não enviar essas pastas ou backups ao Git.

Pré-requisitos técnicos: Windows, Docker de homologação ativo, imagens atuais `erp-dents-homolog-api` e `erp-dents-homolog-web`, Python, Chrome/Playwright e porta 18444 livre. Executar `python scripts/smoke_clinical_full_recovery_homolog.py` com `PLAYWRIGHT_MODULE` apontando para o módulo local. Não executar em paralelo com outros harnesses que usem 18444. Não é um comando de instalação da clínica.

A primeira tentativa revelou duas diferenças na preparação do teste: nome DNS temporário longo demais e montagem da origem de exames em um nível diferente do Compose. Corrigidos os nomes e a montagem; a validação do script agora rejeita essa montagem incorreta antes do backup. O aceite exige execução completa com a preparação corrigida.

## Próximo passo

Consolidar a liberação de instalação após os aceites 4C.1/4C.2: atualizar guias de atualização/recuperação para a migração 0026, explicar a concessão explícita de acesso clínico e a preservação do original por adendos, preparar a versão e verificar o pacote. Não orientar downgrade destrutivo com prontuários existentes. A instalação física continua prioritária quando chegarem os dados do servidor.
