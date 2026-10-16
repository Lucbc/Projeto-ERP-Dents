# Atualização semanal do servidor Windows

## Estado — 16/10/2026

**P4.1 concluída: preparação e conferência de versão.** A troca efetiva com preservação de dados ainda será ensaiada em P4.2. Este documento organiza a manutenção assistida; não é um atualizador automático nem comprovação de atualização em produção. A instalação inicial do piloto continua liberada pelo [roteiro Windows](./INSTALACAO-CLINICA-WINDOWS.md).

Somente o suporte atualiza o servidor. As estações continuam usando a mesma URL e não precisam instalar pacotes. Fazer a manutenção em janela combinada, com um único operador e todos os usuários fora do sistema até o aceite final.

## 1. Preparar a versão antes da janela

1. Escolher uma tag explicitamente liberada nas notas do projeto e registrar seu commit, o commit atual e a data. Conferir o resultado dos testes da versão; a existência de uma tag não comprova sua aprovação.
2. Obter a tag do remoto configurado, sem trocar o código em execução. No repositório do servidor, o suporte pode usar `git fetch origin --tags` e conferir `git status --short`. Parar em caso de conflito de tag ou alterações locais; não usar `--force`, `reset --hard` ou `clean` para contornar.
3. Ler as notas de atualização: mudanças de configuração, migrações e recuperação. A conferência de ancestralidade Git não prova compatibilidade de banco.
4. Conferir espaço para backup e imagens, acesso ao código/dependências, Docker funcionando e destino externo protegido. Guardar a configuração existente; não executar os geradores de `.env`/certificados de instalação nova em cada atualização.

### Conferência somente de leitura

O suporte pode executar o novo `scripts/check-update-version.ps1` de uma cópia atualizada das ferramentas, apontando para o repositório instalado. Ele ainda não faz parte da tag `piloto-cadastros-v0.1.2`; não trocar o código do servidor apenas para obter esse verificador.

Exemplo, substituindo a tag pelo destino aprovado e o caminho pela instalação real:

```powershell
.\scripts\check-update-version.ps1 -Repository 'C:\ERP-Dents' -TargetTag 'piloto-cadastros-v0.1.2'
```

O comando exige histórico completo, árvore de trabalho limpa, tag local no formato do piloto, destino igual ou descendente do commit atual e presença dos arquivos básicos de implantação. Exibe somente identificadores Git e mensagens de estado. Não lê `.env`, não faz fetch/checkout e não chama Docker.

Se indicar que o código já está na versão escolhida, ainda é necessário conferir as imagens realmente em execução. A checagem não certifica backup, migrações, TLS ou funcionamento do sistema. Um destino anterior/divergente é recusado: rollback exige análise própria, não uma exceção automática.

## 2. Executar a janela — sequência a ensaiar em P4.2

1. Avisar a indisponibilidade, retirar os usuários e registrar o início da janela. Escolher um cadastro existente para verificar depois, sem copiar dados pessoais para logs ou Git.
2. Fazer o [backup completo](./BACKUP-RECUPERACAO.md) em pasta nova e protegida. Conferir manifesto e ausência de `INCOMPLETE`; preservar cópia anterior e garantir destino separado. Se falhar, não avançar para troca de versão.
3. **O script de backup tenta reiniciar a API ao terminar, inclusive após falha. Isso não encerra a manutenção.** Manter os usuários fora e interromper novamente o acesso durante a troca. A forma técnica de manter essa interrupção será validada no ensaio integrado.
4. Aplicar a tag aprovada e construir/substituir os serviços previstos nas notas, preservando nome do projeto, configuração, TLS e volumes. Não executar `down -v`, limpeza de volumes ou downgrade automático. Os comandos executáveis de troca serão acrescentados depois do ensaio P4.2.
5. Verificar estado dos serviços, migrações e HTTPS sem ignorar certificado. Conferir login individual, busca por nome/CPF, paginação, abertura e edição autorizada, além de conferir cadastros anteriores. Se houver exames, verificar acesso a um arquivo anterior. Não registrar conteúdo clínico nos relatórios.
6. Reabrir o acesso somente após essas verificações. Registrar versões, horário de início/fim, resultado e responsável, sem segredos/dados pessoais. Em cada estação, recarregar a página e entrar novamente se necessário.

## 3. Se houver falha

Manter a manutenção, preservar código/configuração/volumes e a cópia anterior. Registrar a etapa e o erro sem segredos. Acionar o suporte para avaliar se a falha é de aplicação, infraestrutura ou migração. Não repetir comandos de escrita indiscriminadamente, não reverter código supondo que isso reverta o banco e não restaurar uma cópia antiga sobre registros novos.

A recuperação validada usa ambiente isolado. A decisão de substituir produção e tratar registros posteriores ao backup é assistida; não há restauração destrutiva automática neste procedimento.

## Evidências e próximo passo

- `powershell -NoProfile -File scripts/test-check-update-version.ps1`: nove cenários reais de Git aprovados, com conteúdo fictício em repositório exclusivo sob `.data`; HEAD, estado e referências preservados em cada verificação. Log ignorado `.data/update-version-test.log`.
- Sem teste de API, banco ou interface nesta subetapa; nenhum serviço/volume foi alterado.
- **P4.2:** ensaiar troca de versão em recursos exclusivos de `erp-dents-homolog`, começando com dados fictícios existentes; conferir backup, indisponibilidade durante manutenção, preservação de dados/configuração e retomada. Medir duração e documentar comandos apenas após o aceite. Não usar produção nem volumes de outros projetos.
