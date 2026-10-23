# 3B.2C — atraso financeiro pelo dia da clínica

## Resultado funcional

Código `8180748`, 23/10/2026. Indicadores de atraso e resumo financeiro usam o dia civil de São Paulo, independente do fuso do servidor. Vencimento hoje não está atrasado; somente lançamentos pendentes com vencimento anterior ficam vencidos. Pagos e cancelados não ficam vencidos; o total de vencidos do resumo continua somando apenas receitas, conforme contrato existente.

Cada lista e cada resumo amostram o dia uma única vez. São requisições independentes: na virada da meia-noite, podem refletir instantes diferentes até atualizar novamente. Não há mudança de status, versão, pagamento ou vencimento armazenado. Sem migração, configuração nova ou mudança funcional da interface. O pacote inclui também a atualização da imagem Nginx descrita abaixo.

## Evidências locais

| Camada | Validação | Resultado |
| --- | --- | --- |
| Reprodução | `.data/overdue-before.log` | Código anterior marca vencimento do dia como atrasado em UTC/Tóquio antes da meia-noite clínica; falha também no critério de amostra única |
| Domínio/PostgreSQL | `.data/overdue-after.log` | Três testes aprovados: limites de meia-noite/ano/bissexto/horário de verão histórico, 18 combinações em três fusos de processo/sessão, amostra única mesmo na virada |
| HTTP | `.data/overdue-integrated.log` | Lista, detalhe e resumo aprovados antes/depois da meia-noite em três APIs privadas com fusos distintos |
| Chrome | Mesmo log integrado | Seis cenários, 18 linhas cada: indicadores e total coerentes com API real em São Paulo/UTC/Tóquio; zero gravações pelo leitor |
| SQL direto | Mesmo log integrado | Fingerprints de lançamentos, pagamentos, operações e snapshots de lançamentos/pagamentos idênticos antes/depois das leituras e da virada |

O teste controla somente o relógio financeiro dentro do processo privado da API por comando de inicialização do harness. Não altera relógio do host, sessão/autenticação nem acrescenta opção de relógio fixo ao produto. O comando padrão do harness continua preservado; novos testes HTTP incluídos no CI.

Na preparação, a fixture de pagamento direto foi recusada corretamente pela restrição do banco; substituída por pagamento pelo caso de uso. A comparação inicial de preservação em JSON confundia representações de timestamps em fusos distintos; o teste de banco agora compara valores tipados, preservando a equivalência dos instantes. A matriz final passou com essas correções do teste.

## Correção do bloqueio de segurança

O CI inicial `39957155036` aprovou 328 testes backend (512,891 s), 427 frontend, builds e HTTP, mas recusou web/gateway/edge com três achados HIGH e três MEDIUM por imagem em Nginx 1.30.5. Não foi considerado aprovado.

Código `6f08e88`: base oficial `nginx:1.30.6-alpine` fixada no digest `sha256:47928bf67eb62a1863cb08d9ecb52d3e704304ba614eaee17884204677702951` nas imagens web/gateway/edge. As correções são documentadas nos [avisos oficiais do Nginx](https://nginx.org/en/security_advisories.html). A atualização isolada do pacote foi recusada por incompatibilidade com módulos antigos; a base oficial mantém módulos compatíveis. Os patches anteriores de bibliotecas foram preservados.

- Builds das três imagens e versões 1.30.6 confirmados: `.data/overdue-nginx-build-final.log`.
- Configurações atuais de TLS e gateway aceitas por `nginx -t` em containers temporários: `.data/overdue-nginx-edge-config.log` e `.data/overdue-nginx-gateway-config.log`; validação de configuração, não ensaio de tráfego HTTP nesses dois comandos.
- Auditoria local das seis imagens sem achados: `.data/overdue-nginx-audit-final.log`. Leitura do JSON do scanner corrigida para UTF-8, evitando erro de decodificação no Windows.
- Cadastros em Chrome/API/SQL novamente aprovados com a web atualizada: `.data/overdue-nginx-registration.log`.
- Nenhum container principal substituído. O CI final testa o conjunto completo de proxies; instalação/atualização física e backup não foram repetidos nesta correção.

## Fechamento — 23/10/2026

- Regressão financeira aprovada: 49 testes em 167,079 s (`.data/overdue-financial-regression.log`), incluindo os três novos testes, pagamentos/estornos, concorrência, referências e versões.
- Percurso de cadastros Chrome/API/SQL aprovado (`.data/overdue-registration.log`): permissões, busca, edição/conflito, CPF, nascimento e preservação/limpeza explícita de RG.
- [CI final 40000877678](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/40000877678) aprovado: 328 testes backend em 732,478 s, 427 frontend, builds, HTTP, auditoria de pacotes e seis imagens sem achados. Log local `.data/overdue-ci-final.log`.
- Versão de instalação aprovada: `piloto-cadastros-v0.1.19`, incluindo correção financeira `8180748` e atualização Nginx `6f08e88`. Guias e checklist atualizados; procedimentos e escopo do piloto preservados.

## Limites e próxima etapa

Não houve atualização dos containers principais nem instalação na clínica. Ensaio de backup/atualização U1.14 permanece a referência operacional e não foi repetido; não é prova de uma atualização já executada para v0.1.19. O cálculo altera apenas leituras, enquanto a correção de segurança troca a base de três imagens; schema, volumes e configuração permanecem iguais. O roteiro já contempla reconstruir/substituir as seis imagens com preservação. Esta correção não amplia o escopo liberado do piloto para financeiro/atendimento.

Consolidar 3B.2D com as evidências anteriores de A/B e seguir 3B.3, horários da agenda. Não retomar a sequência adiada de falhas excepcionais de autenticação. P3 físico prioritário quando chegarem dados do servidor.
