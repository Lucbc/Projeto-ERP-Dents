# v0.1.26 — busca de pacientes na agenda

Pacote aprovado para instalação assistida de cadastros em 05/11/2026, com os aceites registrados em [6B.2](./homologacao-etapa-6B-2.md). Código funcional `f17b15f`, CI [41055766576](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/41055766576) aprovado em 30/10: 523 frontend, 368 backend, builds/HTTP e seis imagens sem achados naquela execução.

## O que muda

A lista de consultas, seu filtro por paciente e o calendário carregam 20 pacientes por página. Use **Buscar paciente** por nome, CPF ou telefone e escolha o resultado; os botões permitem percorrer as páginas. O paciente de uma consulta existente continua selecionado mesmo fora da página ou durante outra busca. A seleção também funciona pelo teclado.

Com 5.000 pacientes fictícios, a carga inicial de pacientes caiu de aproximadamente 5,48 MB para 22 KB por operador. Isso reduz tráfego e elimina o download de todos os cadastros para abrir o formulário. O ensaio rápido não certifica o desempenho do computador da clínica nem substitui a medição sustentada de 6B.1.

## Instalar ou atualizar

- Instalação nova: seguir o [roteiro Windows](./INSTALACAO-CLINICA-WINDOWS.md) e o [checklist físico](./CHECKLIST-INICIO-CLINICA.md), usando `piloto-cadastros-v0.1.26`. As estações acessam pelo navegador.
- Instalação existente: seguir o [roteiro de atualização](./ATUALIZACAO-SERVIDOR-WINDOWS.md), com usuários fora, backup completo conferido, troca da tag e reconstrução dos serviços. Preservar configuração, certificados, projeto e volumes; recarregar as abas após a atualização.
- Partindo da v0.1.25, a mudança de produto é somente na interface. Não há nova migração, dependência, variável, senha ou porta. A revisão do banco permanece `0026_clinical_records`.
- Partindo da v0.1.24 ou anterior, também se aplicam as [notas do prontuário/migração 0026](./ATUALIZACAO-PRONTUARIO-V25.md). Não fazer downgrade automático nem restaurar uma cópia antiga sobre registros novos.
- Conferir login, busca/edição de cadastro anterior e, para perfis autorizados à agenda, seleção de paciente, abertura/edição de consulta e manutenção dos horários.

A entrada em uso continua liberada no escopo dos cadastros após o checklist físico. O prontuário mantém permissões explícitas, negadas inicialmente. Esta versão não habilita módulos ou acessos automaticamente.

## Evidências e limites

Consultar [6B.2](./homologacao-etapa-6B-2.md) para componentes, Chrome, API, SQL e CI. Migração e recuperação de 0026 já foram verificadas em [4C.1](./homologacao-etapa-4C-1.md) e [4C.2](./homologacao-etapa-4C-2.md); não houve alteração nesses mecanismos nesta versão.

Todos os ensaios locais usam dados fictícios e recursos privados de `erp-dents-homolog`. A instalação física e o teste de uma segunda estação na clínica continuam pendentes. Próxima melhoria do plano: 6C, usabilidade e financeiro com perfil restrito; instalação física P3 tem prioridade quando chegarem os dados do servidor.

**Publicação conferida:** tag remota `piloto-cadastros-v0.1.26` = `f7e4678ff4dc6968a7b773f4a47924e97d9dfeaa`. O verificador Git aprovou o avanço do checkout limpo v0.1.25. A documentação posterior em main não altera o produto validado nem move a tag.
