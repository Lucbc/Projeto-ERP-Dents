# U1.1 — paginação de pacientes

Iniciada em 15/10/2026, base `768fdde`, concluída em 16/10/2026. **Aprovada para o piloto na versão `piloto-cadastros-v0.1.1`**, implementação `eb7c4da`. A tag anterior permanece imutável. Dados físicos do servidor aguardam confirmação do usuário.

## Mudança

- Pacientes ganha Página anterior/Próxima página, com até 100 resultados por página e indicação da página atual.
- Alterar a busca retorna à primeira página; a lista recua quando exclusões deixam a página atual além do último resultado.
- Falha de carregamento permite voltar à página anterior. Controles respeitam carregamento/conexão e desaparecem quando o acesso é revogado.
- Ordenação usa data de criação e identificador como desempate, evitando ordem indefinida em timestamps iguais. Paginação por deslocamento não congela a lista: cadastros/exclusões concorrentes podem alterar a posição dos resultados entre leituras.
- Sem migração, alteração de dados ou dependências. Busca sem pontuação e por nome social continua na próxima melhoria.

## Evidências locais

- 13 testes de atualização/paginação e 12 de integração de permissões aprovados. Suíte completa frontend: 381 testes em 43 arquivos aprovados; TypeScript/Vite aprovados, com aviso já existente de tamanho de bundle.
- PostgreSQL: teste em schema privado com 205 pacientes de mesmo timestamp; páginas 100/100/5, ordem estável, contagem, filtro e página além do fim aprovados (5,222 s). Arquivo `test_patient_pagination_db.py` incluído na descoberta do CI.
- Chrome/API privados: nova navegação da primeira para a segunda página (105 registros), último paciente visível, próxima desabilitada no fim e busca retornando à primeira página; fluxo de recepção/cadastro/conflito/reabertura aprovado.
- Imagens de API/web construídas para o ensaio privado; containers principais de homologação não foram atualizados nesta implementação.
- Logs ignorados: `.data/pagination-focused.log`, `.data/pagination-permissions.log`, `.data/pagination-db.log`, `.data/pagination-browser.log`, `.data/pagination-build.log`, `.data/pagination-web-final.log`.

Os testes existentes de texto do limite e de navegação foram adaptados: a tela agora tem navegação paginada além do menu; a verificação de revogação cobre todas as chaves de pacientes. A execução inicial da suíte foi interrompida após identificar essa expectativa antiga e reiniciada após correção do teste.

## Retomada

[CI da implementação](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/38836719478) aprovado: 308 testes backend, frontend/build, regressões HTTP e auditorias. Log local ignorado `.data/pagination-ci.log`. Os critérios de componentes, banco e interface foram verificados separadamente; não houve atualização dos containers principais nem instalação física na clínica.

O roteiro Windows passa a selecionar `piloto-cadastros-v0.1.1` para instalação nova. Não aplicar uma branch em movimento na clínica. Para uma instalação existente, seguir a janela assistida com backup do passo 9; esta entrega não executou atualização no servidor da clínica. Próximo: apoiar instalação física P3 quando os dados chegarem e preparar busca por CPF sem pontuação/nome social como subetapa própria, sem repetir testes já aprovados ou ampliar o piloto para outros módulos.
