# v0.1.31 — histórico de acessos e otimização clínica

Consolidação em 13/11/2026. Tag: `piloto-cadastros-v0.1.31`.

## Mudanças

- Histórico protegido por `access_audit.view`: administrador ativo consulta; demais perfis dependem de concessão. Essa permissão não concede acesso ao prontuário ou aos exames.
- Registra consultas clínicas autorizadas e preparação de downloads após a implantação, incluindo atualizações automáticas. Não comprova leitura humana nem entrega do arquivo; não copia conteúdo clínico, arquivos ou credenciais. Não inventa eventos retroativos.
- Filtros/paginação e índices para consulta do histórico; leitura clínica em lote preservando autorização, versões, adendos e gravação atômica da auditoria. Histórico somente leitura, sem expurgo automático.
- Correções de segurança krb5-libs/libxslt nas imagens. Mantém cadastros, histórico de edições de pacientes e demais melhorias anteriores. Odontograma permanece posterior.

## Instalação e atualização

Instalação nova: [roteiro Windows](./INSTALACAO-CLINICA-WINDOWS.md). Existente: [atualização do servidor](./ATUALIZACAO-SERVIDOR-WINDOWS.md). Sem nova variável, porta ou credencial. As estações continuam pelo navegador.

A API aplica 0029, 0030 e `0031_access_audit_indexes` sobre a revisão 0028; versões anteriores aplicam também as migrações pendentes. Backup completo conferido antes da janela; gateway/API parados durante a substituição. Reconstruir as seis imagens, preservar projeto/configuração/TLS/volumes e conferir revisão 0031, login, cadastro anterior, edição e exame anterior antes de reabrir. Recarregar as abas dos usuários.

Os índices são criados dentro da migração transacional, durante manutenção. Não manter APIs de versões diferentes gravando juntas, remover volumes ou voltar a imagem antiga sobre banco migrado. Falha de gravação de auditoria bloqueia a respectiva consulta clínica/download; investigar preservando dados. Dimensionar disco e backups considerando crescimento do histórico.

Não é necessário conceder acesso clínico à recepção para iniciar cadastros. Administrador pode consultar a nova auditoria, mas prontuário continua sujeito à permissão clínica explícita.

## Evidências e limites

- [CI 43435196341](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/43435196341), produto `08df9ab`: 567 testes frontend, 414 backend e seis imagens sem achados de segurança.
- [Interface/permissões](./homologacao-etapa-6D-3-3B.md) e [otimização/capacidade](./homologacao-etapa-6D-3-3B-otimizacao.md): cadastros/Chrome/API/SQL aprovados; carga fictícia com 5.000 pacientes, 192.000 eventos e dez clientes. Não representa capacidade garantida no servidor físico.
- [Recuperação](./homologacao-etapa-6D-3-3C.md): migração 0028→0031, dump, backup Windows real, banco/exames/configuração/TLS, proteções/permissões, Chrome restaurado e reinício aprovados. Aplicação/imagens preservam o produto aprovado; roteiros executados localmente.
- Liberado para instalação assistida do piloto de cadastros após [checklist físico](./CHECKLIST-INICIO-CLINICA.md). Instalação na clínica ainda não executada; dados exatos do servidor pendentes.
