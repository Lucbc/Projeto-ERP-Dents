# v0.1.32 — paginação financeira e correção de dependência

Consolidação em 16/11/2026. Tag: `piloto-cadastros-v0.1.32`.

## Mudanças

- Financeiro permite navegar além dos primeiros 200 lançamentos. Filtros retornam à primeira página; exclusões remotas ajustam páginas que deixaram de existir. Falhas de leitura preservam os dados já exibidos.
- Ordenação com desempate por ID; resumo financeiro mantém seu escopo por vencimento. Pagamentos, permissões e rascunhos conservam as proteções existentes.
- dnspython atualizado de 2.9.0 para 2.9.2, corrigindo CVE-2026-128089 / GHSA-vvf4-9x63-8xvv identificada pela auditoria. Demais versões do lock preservadas.
- Mantém os recursos da [v0.1.31](./ATUALIZACAO-ACESSOS-V31.md). Odontograma continua reservado para etapa posterior.

## Instalação e atualização

Instalação nova: [roteiro Windows](./INSTALACAO-CLINICA-WINDOWS.md). Existente: [atualização do servidor](./ATUALIZACAO-SERVIDOR-WINDOWS.md). Sem nova migração frente à v0.1.31: revisão permanece `0031_access_audit_indexes`. Versões anteriores aplicam as migrações acumuladas. Sem novas variáveis, portas ou credenciais; as estações seguem usando o navegador.

Antes da manutenção, conferir backup completo. Seguir o roteiro para parar gateway/API, reconstruir as imagens e preservar projeto, configuração, TLS, banco e exames. A API e a interface precisam ser atualizadas juntas; reconstruir a API inclui a correção de dependência. Após a subida, conferir revisão 0031, login, pesquisa/edição de cadastro existente e, se utilizado, financeiro e exame anterior. Recarregar as abas dos usuários antes de reabrir o acesso. Nunca remover volumes nem executar downgrade para contornar falhas.

## Evidências e limites

- [Homologação 6E.1](./homologacao-etapa-6E-1.md): componentes, PostgreSQL, HTTP e Chrome com 205 lançamentos; regressões financeiras e de cadastros aprovadas.
- Build da API corrigida e cadastros Chrome/API/SQL aprovados. Auditorias npm/Python sem achados. [CI 43870480572](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/43870480572) do produto `bcf55f3` aprovado: 570 testes frontend, 415 backend (976,154 s), fluxos HTTP e seis imagens sem achados.
- Recuperação completa da revisão 0031 validada na [v0.1.31](./homologacao-etapa-6D-3-3C.md). Não repetida nesta etapa, que não altera migração, armazenamento ou configuração operacional.
- A instalação física ainda depende dos dados do computador e do [checklist local](./CHECKLIST-INICIO-CLINICA.md). Não representa aceite no servidor da clínica nem habilita novos módulos automaticamente.
