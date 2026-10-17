# U1.3 — busca por telefone sem pontuação

Concluída em 16/10/2026, base `9cc48a0`, código `92b3433`. Liberada com U1.4 na tag `piloto-cadastros-v0.1.4`; tags anteriores preservadas.

## Comportamento

- A busca de pacientes compara também os dígitos do telefone quando o termo contém somente números e sinais de formatação (`+`, parênteses, ponto, hífen e espaços).
- Exemplo fictício: `(11) 3333-4444` pode ser encontrado por `1133334444` ou por um trecho do número.
- Texto misturado com números continua sendo pesquisado como texto. Pontuação isolada não vira uma busca numérica vazia.
- Telefones cadastrados não são regravados. Não inventa DDD/código do país, não corrige números nem altera máscaras dos formulários. Nomes ainda diferenciam acentos.
- Sem migração, configuração ou dependência nova. CPF, nome social e demais campos mantidos.

## Validação e retomada

- PostgreSQL privado: teste ampliado aprovado (2,915 s), incluindo telefone formatado/não formatado, código do país, trecho local, casos negativos e preservação dos valores; regressões de CPF/nome social, contagem e páginas no mesmo teste.
- Imagem API construída em homologação. Logs locais ignorados `.data/phone-search-db.log`, `.data/phone-search-build.log` e `.data/phone-search-browser.log`.
- Chrome/API aprovados: conta de recepção localiza o mesmo paciente por telefone formatado e só dígitos, conferindo resposta HTTP/ID; fluxo de cadastro, conflito e reabertura continua aprovado. Recursos privados limpos e origem preservada. CI `38944961692` aprovado; pacote conjunto também aprovado no [CI 38945859869](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/38945859869), com 309 testes backend e 393 frontend, HTTP/build/auditorias. Roteiros atualizados para a nova versão.

O usuário autorizou continuar melhorias enquanto aguarda os dados do computador. Quando chegar essa informação, priorizar instalação física P3, encerrando a subetapa em um ponto seguro. Não condicionar a instalação às demais melhorias da fila.
