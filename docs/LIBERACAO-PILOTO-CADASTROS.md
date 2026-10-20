# Liberação para instalar — piloto de cadastros

**19/10/2026: liberado para instalação assistida na clínica, no escopo abaixo.** Versão identificada pela tag Git **`piloto-cadastros-v0.1.10`**. Tags anteriores preservadas; inclui [paginação](./ATUALIZACAO-U1-1.md), [busca por CPF sem pontuação/nome social](./ATUALIZACAO-U1-2.md) e [ferramentas/roteiro de atualização](./ATUALIZACAO-SERVIDOR-WINDOWS.md). A `v0.1.4` inclui [busca por telefone sem pontuação](./ATUALIZACAO-U1-3.md) e [preservação de telefones na edição](./ATUALIZACAO-U1-4.md), sem mudança de configuração, dependências ou migrações frente à `v0.1.3`. A `v0.1.5` acrescenta [busca por nomes sem acentos](./ATUALIZACAO-U1-5.md), sem migração ou alteração de configuração. A `v0.1.6` inclui [aviso de duplicidade na criação](./ATUALIZACAO-U1-6.md) e substitui a versão indisponível de libexpat nas imagens Nginx. A `v0.1.7` inclui [proteção de CPF na gravação e preservação de documentos históricos](./ATUALIZACAO-U1-6C.md), além de correções libx11/libxpm nas imagens Nginx, sem migração. A `v0.1.8` inclui [validação de formato e dígitos de CPF, com históricos preservados](./ATUALIZACAO-U1-6D.md). A `v0.1.9` acrescenta [proteção contra nascimento futuro em novas atribuições](./ATUALIZACAO-U1-7.md), mantendo históricos editáveis. O início dos cadastros reais depende de concluir as verificações locais do [roteiro Windows](./INSTALACAO-CLINICA-WINDOWS.md), pois o outro computador e a rede da clínica ainda não foram acessados.

## O que está liberado

A v0.1.10 acrescenta [preservação do RG durante a digitação](./ATUALIZACAO-U1-8.md), sem migração ou mudança de configuração.

- Contas individuais; administrador configura os acessos.
- Consultar, cadastrar e editar pacientes, inclusive sem CPF.
- Digitação manual dos registros existentes. Não há importação de outro sistema.
- Backup assistido e suporte para recuperação; atualizações posteriores em janela semanal.

Esta liberação não abrange uso operacional de agenda, financeiro ou prontuário. Para quem fará somente a digitação, configurar **Painel: visualizar** e **Pacientes: visualizar/criar/editar**, deixando exclusão e demais módulos desabilitados. O Painel só consulta indicadores de recursos autorizados. Usar uma senha exclusiva por pessoa.

## Aceites técnicos realizados

| Área | Resultado |
| --- | --- |
| Pacote v0.1.10 | [CI 39352073699](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/39352073699) aprovado: 324 backend, 406 frontend, builds, HTTP e auditorias; preservação de RG em componente/Chrome/API e gravação/limpeza em PostgreSQL privado aprovadas |
| Pacote v0.1.9 | [CI 39298646785](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/39298646785) aprovado: 324 backend, 405 frontend, builds, HTTP e auditorias; nascimento futuro validado em banco/API/Chrome e atualização com histórico preservado aprovada em 146,31 s sem build/download |
| Pacote v0.1.8 | [CI 39257185004](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/39257185004) aprovado: 322 backend, 403 frontend, builds, HTTP e auditorias; validação de novos CPFs em banco/API/Chrome e atualização com histórico inválido preservado aprovadas |
| Pacote v0.1.7 | [CI 39159743791](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/39159743791) aprovado: 318 backend, 400 frontend, builds, HTTP e auditorias; atualização com troca API/web/proxies e preservação aprovada em 63,94 s sem build/download |
| CPF na gravação | PostgreSQL privado e Chrome/API: inativos e gravações simultâneas protegidos; rascunho corrigível após conflito; históricos e cadastro sem CPF preservados |
| Instalação nova | Configuração/segredos e certificado gerados pelos scripts Windows; Compose de produção adaptado exclusivamente para recursos privados de homologação; banco e exames vazios, migrações, administrador e login aprovados |
| Reexecução e reinício | Repetir inicialização e reiniciar serviços preservou cadastro e instalação ativada; não equivale a reiniciar fisicamente o Windows |
| Recuperação | Banco/exames comparados, configuração/TLS recuperados, login e cadastro, download antigo, upload novo e persistência aprovados; origem preservada |
| Recepção em Chrome | Conta individual sem administração/financeiro/exclusão; cadastro sem CPF, nascimento, edição, conflito preservando rascunho, nomes semelhantes e reabertura aprovados |
| Volume inicial | 105 pacientes fictícios antes do cadastro pela interface; busca pelo nome completo encontrou o registro mais antigo, fora dos primeiros 100; CPF com pontuação encontrado |

Os ensaios usaram imagens já construídas e, na instalação nova, cópia das assinaturas do antivírus em volume privado para evitar novo download. Não comprovam instalação sem internet, capacidade máxima de usuários ou outra máquina física. A recepção foi ensaiada em duas sessões independentes do Chrome, no mesmo computador.

## Limites conhecidos para orientar quem digita

- Nascimento novo ou alterado não pode estar no futuro, considerando o dia de São Paulo. Pode ficar em branco; datas históricas mantidas não impedem editar outros campos. Conferir os relógios do servidor e das estações.
- A lista mostra até 100 resultados por página, com Página anterior/Próxima página. **Não há limite de 100 cadastros no banco.** Buscar pelo nome completo e conferir as páginas antes de criar um registro. Alterar a busca volta à primeira página. Não interpretar a ausência na primeira lista como inexistência do paciente.
- CPF pode ser buscado com ou sem pontos, hífen e espaços. Nome social/preferido também participa da busca, sem distinção de maiúsculas/minúsculas. Conferir os dados do resultado antes de criar outro cadastro.
- Telefone pode ser buscado com ou sem pontuação, inclusive por trecho dos dígitos. Nome completo e nome social podem ser buscados com ou sem acentos, preservando a grafia cadastrada.
- Nomes semelhantes e pessoas sem CPF podem ser cadastrados. Conferir nascimento e demais dados antes de criar outro registro; o sistema não faz deduplicação automática por nome.
- Na v0.1.7, além do aviso antecipado no formulário Novo, novas atribuições de CPF completo equivalente são bloqueadas na criação/edição, inclusive com gravações simultâneas e cadastros inativos. Duplicados históricos com CPF mantido continuam editáveis; nenhum registro é unido ou excluído. Na v0.1.8, CPF novo ou alterado precisa passar pela validação de formato e dígitos verificadores; ausência continua permitida. Documentos históricos mantidos não impedem editar outros campos. A validação não comprova titularidade ou situação cadastral. Consultar antes de cadastrar continua necessário. [Regra e evidências U1.6C](./ATUALIZACAO-U1-6C.md).
- Se houver conflito de edição, conferir a alteração da outra pessoa e recarregar o cadastro antes de salvar. O teste comprovou a preservação do rascunho e a recusa de sobrescrita silenciosa.

Paginação entregue na U1.1: Chrome/API com 105 registros e banco com 205 registros aprovados. Busca ampliada entregue na U1.2: PostgreSQL, Chrome/API e CI com 309 testes backend/381 frontend aprovados. Instalação vazia e recuperação são evidências da versão inicial; não foram repetidas nesta atualização sem mudanças de infraestrutura. Não representa conclusão da revisão geral de cadastros.

## Antes do primeiro cadastro real, no local

1. Conferir Windows compatível, recursos, Docker iniciado e conta responsável pelo servidor.
2. Instalar esta versão pelo roteiro; definir endereço estável e HTTPS confiável.
3. Criar contas individuais e testar o perfil restrito de cadastro.
4. Em outra estação, cadastrar/editar/localizar um registro fictício.
5. Fazer backup em destino separado e confirmar com o suporte o procedimento de recuperação, conforme [backup e recuperação](./BACKUP-RECUPERACAO.md).
6. Reiniciar o Windows, iniciar/verificar Docker conforme a rotina combinada e conferir acesso pela outra estação e preservação do registro fictício.

**Concluídos esses passos, começar os cadastros reais.** Não é necessário esperar as demais melhorias do ERP. Caso algum passo falhe, resolver esse bloqueio específico antes de iniciar, sem apagar volumes.

## Evidências e retomada

U1.6B: [CI 39036439232](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/39036439232) aprovado no código `de20ba1`: 311 backend e 398 frontend, builds, HTTP e auditorias. Banco privado e Chrome/API validaram aviso, rascunho e permissões. Ensaio de atualização preservou dados, exame, sessão, configuração/TLS e volumes, com backup restaurado, consulta de duplicidade sem escrita, edição e novo login; 115,31 s sem build/download. Proxies corrigidos usados com API antiga e nova por indisponibilidade da imagem antiga local; esse limite está registrado na U1.6. Nenhuma instalação física realizada.

U1.5: [CI 38989240918](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/38989240918) do código `95d0666` aprovado, com 310 testes backend e 393 frontend. PostgreSQL privado e Chrome/API aprovaram busca de nomes completos/sociais sem acentos e preservação da grafia. Sem migração, mudança de configuração ou novo ensaio de instalação/troca de imagens nesta entrega; as evidências operacionais abaixo são das versões anteriores.

Instalação: `scripts/smoke_windows_install_homolog.py`, relatório local ignorado `.data/install_466b9495e6b7/result.json`. Recepção: `scripts/smoke_registration_pilot_homolog.py`, relatório `.data/homolog/last-registration-pilot.json`. Recuperação: `scripts/smoke_backup_restore_homolog.py --application` e [evidências](./BACKUP-RECUPERACAO.md).

U1.3/U1.4 aprovadas em PostgreSQL, componentes e Chrome/API. [CI do código b4678e3](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/38945859869) aprovado: 309 testes backend e 393 frontend, builds, regressões HTTP e auditorias. Telefones internacionais e ramais são preservados ao editar pacientes, contatos de emergência e dentistas. Ensaio Windows/Docker de atualização da v0.1.3 com novas imagens API/web aprovado: backup restaurado, tabelas/exame/sessão/configuração/TLS/volumes preservados, busca/edição/novo login; 50,84 s de manutenção sem build/download. Esse ensaio de atualização usa HTTP; o navegador foi validado separadamente. Próximo: melhorias em subetapas enquanto aguardamos os dados do servidor; priorizar instalação física P3 assim que chegarem. Novas migrações exigem ensaio próprio.
