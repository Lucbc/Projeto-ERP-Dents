# 6E.1 — paginação do financeiro

Início em 13/11 e retomada em 16/11/2026, base `e5646f1`. Correção do limite visual de 200 lançamentos; nenhuma migração ou mudança de configuração.

## Problema e mudança

A API já aceitava limite/deslocamento, mas a tela fixava deslocamento zero e só recomendava refinar os filtros. Agora permite navegar em páginas de até 200 lançamentos. Mudanças nos filtros retornam à primeira página. Se exclusões remotas tornarem a página inválida, uma leitura bem-sucedida reposiciona para a última página existente; erro de rede não é interpretado como lista vazia.

Resumo financeiro mantém seu escopo por vencimento, independente da página. Atualização automática conserva a página e não substitui rascunhos ou ações capturadas. Permissões e pagamentos permanecem sujeitos às proteções anteriores. A API desempata vencimento/criação iguais pelo ID, tornando a ordem determinística. Paginação acompanha dados atuais, não representa fotografia congelada entre alterações concorrentes.

## Validação local

- Reprodução: teste de componente falhou pela ausência do botão de próxima página antes da correção.
- Componentes: 48 testes aprovados em cinco arquivos, incluindo paginação/reset de busca, resumo independente, erro/recuperação, redução remota e rascunho preservado; regressões de edição, pagamentos e referências incluídas.
- Backend/PostgreSQL: 50 testes financeiros aprovados em 213,957 s, incluindo novo caso de empate de datas com paginação sem repetição/omissão; histórico, versões, concorrência e datas mantidos.
- Build API/web da paginação aprovado. Esquema inalterado; atualização posterior de dependência descrita abaixo.
- API/SQL: massa fictícia de 205 lançamentos com datas iguais, ordem por ID conferida integralmente; páginas 200+5 e página além do fim vazia com total correto.
- Chrome/API: perfil somente leitura, primeira/segunda página, erro 503 com linhas preservadas e recuperação, busca/limpeza de filtros, exclusão de cinco lançamentos por outra sessão com retorno à primeira página e revogação de acesso. Zero escritas pelo leitor. Captura da segunda página inspecionada.
- SQL final: 200 linhas restantes, versões e valores preservados, nenhum pagamento gerado. Esquema/API/segredos temporários removidos; volumes principais preservados.
- Primeiro ensaio da massa SQL parou antes da interface porque faltava definir search_path do esquema privado para os triggers financeiros. Preparação corrigida e ensaio repetido com sucesso; não foi alteração do comportamento da aplicação.

Regressões adicionais de histórico/pagamentos HTTP, atualização financeira Chrome (sessões independentes, conflitos, filtros/rascunhos, erros e revogação) e cadastros Chrome/API/SQL aprovadas. Logs locais `financial-pagination-history.log`, `financial-pagination-refresh.log` e `financial-pagination-registration.log`.

## Correção da auditoria de dependências

CI [43869711128](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/43869711128) do produto `32daad6` interrompido antes dos testes pela auditoria Python. Reprodução local identificou dnspython 2.9.0 afetado por CVE-2026-128089 / GHSA-vvf4-9x63-8xvv, consumo excessivo de memória/CPU ao interpretar registro WKS de arquivo de zona malicioso. O ERP não oferece importação de zonas DNS; a dependência é mantida por email-validator. Atualização restrita para a versão corrigida 2.9.2, sem alterar outras versões do lock. Auditorias npm/Python locais aprovadas em `.data/security-pagination-fixed`. Build da API corrigida e cadastros Chrome/API/SQL aprovados (`financial-pagination-dns-build.log`, `financial-pagination-dns-registration.log`). Novo [CI 43870480572](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/43870480572), produto `bcf55f3`, aprovado: 570 frontend, 415 backend (976,154 s), fluxos HTTP e seis imagens sem achados.

Evidências locais ignoradas: `.data/financial-pagination-before.log`, `financial-pagination-components.log`, `financial-pagination-backend.log`, `financial-pagination-build.log`, `financial-pagination-api-build.log`, `financial-pagination-browser.log` e `financial-pagination-page-two.png`.

## Próximo

Aceites funcionais e CI concluídos. Guias alinhados para v0.1.32/0031; publicar e conferir a tag e o avanço de checkout limpo da v0.1.31. Não repetir recuperação completa por esta alteração sem migração, armazenamento ou configuração; dados financeiros não são regravados pela nova navegação.
