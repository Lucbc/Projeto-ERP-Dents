# U1.1 — paginação de pacientes

Iniciada em 15/10/2026, base `768fdde`. **Em validação; não altera a tag liberada `piloto-cadastros-v0.1.0`.** Dados físicos do servidor aguardam confirmação do usuário.

## Mudança

- Pacientes ganha Página anterior/Próxima página, com até 100 resultados por página e indicação da página atual.
- Alterar a busca retorna à primeira página; a lista recua quando exclusões deixam a página atual além do último resultado.
- Falha de carregamento permite voltar à página anterior. Controles respeitam carregamento/conexão e desaparecem quando o acesso é revogado.
- Ordenação usa data de criação e identificador como desempate, evitando ordem indefinida em timestamps iguais. Paginação por deslocamento não congela a lista: cadastros/exclusões concorrentes podem alterar a posição dos resultados entre leituras.
- Sem migração, alteração de dados ou dependências. Busca sem pontuação e por nome social continua na próxima melhoria.

## Evidências locais

- 13 testes de atualização/paginação e 12 de integração de permissões aprovados. Suíte completa frontend em execução; TypeScript/Vite aprovados, com aviso já existente de tamanho de bundle.
- PostgreSQL: teste em schema privado com 205 pacientes de mesmo timestamp; páginas 100/100/5, ordem estável, contagem, filtro e página além do fim aprovados (5,222 s). Arquivo `test_patient_pagination_db.py` incluído na descoberta do CI.
- Chrome/API privados: nova navegação da primeira para a segunda página (105 registros), último paciente visível, próxima desabilitada no fim e busca retornando à primeira página; fluxo de recepção/cadastro/conflito/reabertura aprovado.
- Imagens de API/web construídas para o ensaio privado; containers principais de homologação não foram atualizados nesta implementação.
- Logs ignorados: `.data/pagination-focused.log`, `.data/pagination-permissions.log`, `.data/pagination-db.log`, `.data/pagination-browser.log`, `.data/pagination-build.log`, `.data/pagination-web-final.log`.

Os testes existentes de texto do limite e de navegação foram adaptados: a tela agora tem navegação paginada além do menu; a verificação de revogação cobre todas as chaves de pacientes. A execução inicial da suíte foi interrompida após identificar essa expectativa antiga e reiniciada após correção do teste.

## Retomada

Concluir suíte frontend e CI, verificar resultado sem repetir os ensaios já aprovados. Depois definir publicação da atualização; até lá, continuar a instalação clínica com a versão liberada. O roteiro da `v0.1.0` mantém o limite de lista porque a tag é imutável. Não aplicar uma branch em movimento na clínica.
