# 6B.2 — seleção de pacientes sem carregar o cadastro inteiro

## Mudança

Base `96f4941`. A lista de consultas, seu filtro por paciente e o calendário passam a consultar páginas de 20 pacientes na API existente, com busca por nome/CPF/telefone e navegação de páginas. Não há nova rota, migração, dependência ou configuração.

O paciente de uma consulta em edição é recuperado diretamente quando está fora da página inicial. Buscar/paginar não troca essa seleção; indisponibilidade mantém o identificador e impede salvar até revisão. Resultados atrasados são cancelados, erro de busca permite tentar novamente e 401/403 retira os dados da seleção. Pacientes com mesmo nome mostram nascimento/CPF quando disponíveis. O seletor nativo permite uso por teclado; selecionar um resultado já lido não provoca nova carga nem bloqueio dos demais campos. Atualização explícita revalida os cadastros sem substituir os horários/rascunho.

Arquivos principais: `use-patient-references.ts`, `patient-picker.tsx` e integração nas duas páginas de consultas. A API continua aplicando suas regras e permissões de cadastro/agenda; não houve mudança nos bloqueios transacionais clínicos.

## Validação por camada

- **Componentes:** 523 testes frontend aprovados, incluindo seis novos casos de paginação, homônimos, seleção fora da página, resposta antiga, 403, 404 e recuperação de erro. Regressões de referências, disponibilidade, versão/exclusão e datas continuam aprovadas. Build da imagem web concluído.
- **HTTP/SQL/Chrome:** ensaio em schema/API/web privados com 5.000 pacientes fictícios; aprovado, incluindo criação na lista, edição no calendário mantendo o paciente fora da página, filtro e uso por teclado. API/SQL confirmaram dez criações distintas, conflitos de versão/CPF, recibos clínicos e preservação das tabelas principais. Utiliza `measure_concurrent_usage_homolog.py --quick --bounded-patients`. A opção nova mede a abertura limitada e amplia o navegador para criar na lista, editar no calendário e filtrar o paciente. O modo rápido não substitui as janelas sustentadas de 6B.1; esta alteração é de carregamento da interface, mantendo a API.
- **Massa de teste:** corrigidos UUIDs determinísticos da inserção em lote para formato válido no formulário; concedida explicitamente a leitura do calendário à conta fictícia. Esses dois ajustes no harness não são correções de produto. O paciente escolhido é o primeiro da massa antiga, fora da página inicial ordenada por criação, para realmente testar a recuperação direta ao editar.
- **CI/regressões integradas:** pendentes; instalação permanece v0.1.25 até concluir aceites e publicar pacote.

## Retomada

Ensaio ampliado aprovado: referências de pacientes passaram de 25 páginas/5.475.797 bytes para uma página/21.940 bytes por operador (cerca de 99,6% menos dados). Abertura HTTP máxima com dez operadores: 469 ms no ensaio rápido; baseline sustentada: 5.047 ms. Tempos Chrome de abrir/buscar/selecionar permaneceram próximos de 1,75 s; não afirmar ganho equivalente de tempo de tela nem capacidade sustentada a partir do modo rápido. Comparar limites com [6B.1](./homologacao-etapa-6B-1.md), verificar regressão Chrome de cadastros e referências da agenda, CI e nova tag. Preservar volumes/containers principais e seguir o procedimento normal de atualização. Próxima etapa após entrega: 6C, usabilidade/perfil financeiro restrito; P3 físico permanece prioritário quando chegarem os dados do servidor.
