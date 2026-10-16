# Liberação para instalar — piloto de cadastros

**16/10/2026: liberado para instalação assistida na clínica, no escopo abaixo.** Versão identificada pela tag Git **`piloto-cadastros-v0.1.3`**. Tags anteriores preservadas; inclui [paginação](./ATUALIZACAO-U1-1.md), [busca por CPF sem pontuação/nome social](./ATUALIZACAO-U1-2.md) e [ferramentas/roteiro de atualização](./ATUALIZACAO-SERVIDOR-WINDOWS.md). A `v0.1.3` altera ferramentas de backup e ensaio, sem mudança da aplicação, configuração, dependências ou migrações frente à `v0.1.2`. O início dos cadastros reais depende de concluir as verificações locais do [roteiro Windows](./INSTALACAO-CLINICA-WINDOWS.md), pois o outro computador e a rede da clínica ainda não foram acessados.

## O que está liberado

- Contas individuais; administrador configura os acessos.
- Consultar, cadastrar e editar pacientes, inclusive sem CPF.
- Digitação manual dos registros existentes. Não há importação de outro sistema.
- Backup assistido e suporte para recuperação; atualizações posteriores em janela semanal.

Esta liberação não abrange uso operacional de agenda, financeiro ou prontuário. Para quem fará somente a digitação, configurar **Painel: visualizar** e **Pacientes: visualizar/criar/editar**, deixando exclusão e demais módulos desabilitados. O Painel só consulta indicadores de recursos autorizados. Usar uma senha exclusiva por pessoa.

## Aceites técnicos realizados

| Área | Resultado |
| --- | --- |
| Instalação nova | Configuração/segredos e certificado gerados pelos scripts Windows; Compose de produção adaptado exclusivamente para recursos privados de homologação; banco e exames vazios, migrações, administrador e login aprovados |
| Reexecução e reinício | Repetir inicialização e reiniciar serviços preservou cadastro e instalação ativada; não equivale a reiniciar fisicamente o Windows |
| Recuperação | Banco/exames comparados, configuração/TLS recuperados, login e cadastro, download antigo, upload novo e persistência aprovados; origem preservada |
| Recepção em Chrome | Conta individual sem administração/financeiro/exclusão; cadastro sem CPF, nascimento, edição, conflito preservando rascunho, nomes semelhantes e reabertura aprovados |
| Volume inicial | 105 pacientes fictícios antes do cadastro pela interface; busca pelo nome completo encontrou o registro mais antigo, fora dos primeiros 100; CPF com pontuação encontrado |

Os ensaios usaram imagens já construídas e, na instalação nova, cópia das assinaturas do antivírus em volume privado para evitar novo download. Não comprovam instalação sem internet, capacidade máxima de usuários ou outra máquina física. A recepção foi ensaiada em duas sessões independentes do Chrome, no mesmo computador.

## Limites conhecidos para orientar quem digita

- A lista mostra até 100 resultados por página, com Página anterior/Próxima página. **Não há limite de 100 cadastros no banco.** Buscar pelo nome completo e conferir as páginas antes de criar um registro. Alterar a busca volta à primeira página. Não interpretar a ausência na primeira lista como inexistência do paciente.
- CPF pode ser buscado com ou sem pontos, hífen e espaços. Nome social/preferido também participa da busca, sem distinção de maiúsculas/minúsculas. Conferir os dados do resultado antes de criar outro cadastro.
- Telefone ainda exige a pontuação usada no cadastro; nomes não ignoram acentos. Quando houver dúvida, buscar por CPF ou por outro trecho do nome.
- Nomes semelhantes e pessoas sem CPF podem ser cadastrados. Conferir nascimento e demais dados antes de criar outro registro; o sistema não faz deduplicação automática por nome.
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

Instalação: `scripts/smoke_windows_install_homolog.py`, relatório local ignorado `.data/install_466b9495e6b7/result.json`. Recepção: `scripts/smoke_registration_pilot_homolog.py`, relatório `.data/homolog/last-registration-pilot.json`. Recuperação: `scripts/smoke_backup_restore_homolog.py --application` e [evidências](./BACKUP-RECUPERACAO.md).

P4.2 aprovada localmente com ensaios Windows/Docker de atualização, restauração, bloqueio durante backup e falha simulada. A aplicação conserva o aceite de CI da U1.2; não houve novo teste de navegador nesta entrega operacional. Próximo: instalação física P3, definição da janela semanal e acompanhamento dos primeiros cadastros. Novas migrações exigem ensaio próprio. Não reabrir a revisão inteira nem colocar financeiro/prontuário no caminho desse piloto.
