# Instalação v0.1.25 — prontuário e preservação dos dados

Pacote `piloto-cadastros-v0.1.25`, preparado em 29/10/2026. Sucede a v0.1.24 e mantém seu histórico Git, permitindo a conferência de avanço pelo `check-update-version.ps1`. A instalação inicial na clínica continua destinada aos cadastros; o prontuário está incluído no pacote, com acesso negado até configuração explícita pelo responsável. Não representa liberação geral de agenda/financeiro nem instalação física já realizada.

## O que muda

- API e interface de prontuário: contexto atual do paciente, leitura paginada, rascunho por consulta, finalização e correção por adendo. Autoria vinculada ao dentista, permissões por perfil, conflito entre abas e recuperação de tentativa sem duplicação.
- Migração **0026_clinical_records**, sobre 0025: acrescenta tabelas de evoluções, adendos e recibos, restrições de vínculos e proteções do histórico. Não transforma notas antigas em evoluções, não preenche registros automaticamente e não reescreve alergias/histórico do cadastro.
- Acesso clínico inicialmente negado em todos os perfis, inclusive administrador. Os acessos existentes aos cadastros permanecem. Alergias/histórico legados continuam sob suas permissões anteriores.
- Vínculos de registros clínicos impedem exclusões/reassociações incompatíveis de pacientes, consultas, dentistas e autores. Tratar o conflito conforme a mensagem; não apagar registros diretamente no banco para contornar a proteção.
- Mantém dnspython 2.9.0 da v0.1.24, PostgreSQL 16 e a configuração existente. Nenhuma nova variável de ambiente, senha, porta ou instalação nas estações.

## Instalação nova

Seguir o [roteiro Windows](./INSTALACAO-CLINICA-WINDOWS.md) usando a tag v0.1.25. A API aplica as migrações ao iniciar. Criar contas próprias da clínica; não copiar contas, configuração, certificados ou bancos de homologação. Concluir o [checklist físico](./CHECKLIST-INICIO-CLINICA.md) antes de digitar dados reais.

Para recepção/digitação, manter apenas os acessos necessários a Painel e Pacientes. Não conceder Prontuário clínico para começar os cadastros.

## Atualização de uma instalação existente

Seguir os blocos do [roteiro de atualização](./ATUALIZACAO-SERVIDOR-WINDOWS.md), um por vez:

1. Conferir versão, árvore limpa, tag aprovada e espaço disponível. A v0.1.24 foi integrada ao histórico da nova versão; não ignorar rejeição do verificador.
2. Retirar usuários, parar o gateway e fazer **backup completo da versão instalada**, em pasta nova. Conferir manifesto e ausência de `INCOMPLETE`. Não prosseguir se falhar.
3. Parar a API, trocar para a tag v0.1.25 e construir as seis imagens previstas no roteiro. Preservar projeto, `.env`, TLS e volumes. Não executar APIs antiga/nova simultaneamente contra o mesmo banco.
4. Subir os serviços conforme o roteiro. A API aplica 0026 antes de atender. Conferir a revisão com `docker @composeArgs exec -T api alembic current`: deve indicar `0026_clinical_records (head)`. Se a migração falhar, manter a manutenção e preservar banco/logs sem publicar dados ou segredos.
5. Conferir HTTPS, login individual, cadastro anterior, busca/edição autorizadas e exame anterior quando existente. Confirmar que a recepção não recebeu leitura clínica automaticamente. Recarregar as abas das estações.
6. Registrar versão/resultado/responsável e produzir uma nova cópia após a atualização. Essa cópia passa a incluir as tabelas clínicas mesmo se ainda estiverem vazias.

As notas acima não autorizam habilitar todos os módulos para todos os usuários. Se a clínica decidir iniciar o prontuário, o responsável configura as permissões e o vínculo dos dentistas, orienta o fluxo pelo [guia clínico](./PRONTUARIO-CLINICO.md) e valida o acesso de cada perfil antes do primeiro atendimento.

## Recuperação e limite de retorno

O [backup completo](./BACKUP-RECUPERACAO.md) inclui banco, exames, configuração e certificados. O dump inclui originais, adendos, contextos, autores e recibos de tentativas. Guardar também o acesso ao código/imagens da versão registrada no manifesto.

**Não fazer downgrade automático.** Havendo evoluções, a migração recusa apagar o histórico. Voltar somente o código para v0.1.24 não reverte o banco. Restaurar um backup anterior descarta, na cópia restaurada, todos os registros posteriores àquela cópia, não apenas prontuários. Preservar o estado atual e executar recuperação assistida em destino separado antes de qualquer troca de ambiente ativo.

## Evidências

| Aceite | Resultado |
| --- | --- |
| Produto | CI [40879673431](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/40879673431), código `4eb6ef5`: 517 frontend, 368 backend, builds/HTTP e seis imagens sem achados. A integração/documentação do pacote não altera o código validado |
| Migração | [4C.1](./homologacao-etapa-4C-1.md): imagem v0.1.24/0025 com dados fictícios migrou para 0026, preservando todas as linhas anteriores; dump/restauração, gatilhos e recuperação clínica por API aprovados |
| Backup completo | [4C.2](./homologacao-etapa-4C-2.md): script Windows real, exames/configuração/TLS/manifesto, banco e arquivos idênticos, login, Chrome, edição e reinício restaurados aprovados |
| Cadastros no pacote | Chrome/API/PostgreSQL aprovados novamente: CPF, nascimento, documentos legados, permissões, busca, conflito, reabertura e RG preservados. Log local `.data/pilot-v25-registration.log` |
| Continuidade Git | Merge `c021b1e` sem alteração da árvore de arquivos; ancestralidade confirmada. `check-update-version.ps1` aprovou checkout limpo v0.1.24 (`aedbde0`) → tag v0.1.25 (`505528f`) |

Nenhum container principal foi recriado para este pacote. Os aceites usam somente recursos e dados fictícios de homologação. A edição/recursos do outro computador Windows e a rede local ainda precisam ser confirmados na instalação física.

**Publicação conferida:** tag remota `piloto-cadastros-v0.1.25` aponta para `505528f45216202e1005213aad33c6150e5b49a5`. A consolidação documental posterior em main não move a tag nem altera aplicação, imagens ou scripts validados.
