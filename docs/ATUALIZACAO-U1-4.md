# U1.4 — preservar telefones ao editar cadastros

Concluída em 16/10/2026, base `92b3433`, código `b4678e3`. Liberada com U1.3 na tag `piloto-cadastros-v0.1.4`; tags anteriores preservadas.

## Problema e correção

As duas máscaras locais usavam `slice(0, 11)` e eram aplicadas ao abrir o editor. Um telefone internacional ou contato com ramal podia perder informação mesmo quando o operador alterava apenas outro campo. Telefones fixos também eram separados como celulares.

- Pacientes, contato de emergência e dentistas carregam o valor salvo sem aplicar máscara.
- A função compartilhada `src/lib/phone.ts` formata números locais digitados com 10 dígitos como `(11) 3333-4444` e 11 como `(11) 98765-4321`.
- Números com mais de 11 dígitos, prefixo `+` ou texto de ramal são mantidos, sem truncagem. Não há validação nova de telefone nem migração/regravação em lote.
- Busca por telefone sem pontuação continua na U1.3; remoção de acentos e validação de CPF não fazem parte deste recorte.

## Evidências

- Componentes: 26 testes de pacientes/dentistas aprovados, incluindo duas regressões novas de abertura e envio sem alterar o telefone.
- Dez casos da função compartilhada adicionados à descoberta de testes `.test.tsx`; a primeira execução focada não os incluiu porque o arquivo inicialmente usava `.test.ts`. Não contabilizar essa primeira execução como teste do formatador.
- TypeScript/Vite/imagem web aprovados. Chrome/API privados aprovados para preservação do telefone internacional e ramal durante edição, conflito e reabertura, além das buscas e demais operações do piloto.
- Suíte frontend completa aprovada: 393 testes em 44 arquivos (112,76 s), incluindo os dez casos do formatador. [CI 38945859869](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/38945859869) aprovado: 309 backend, 393 frontend, HTTP/build/auditorias. Logs ignorados: `.data/phone-form-focused.log`, `.data/phone-form-build.log`, `.data/phone-form-browser.log`, `.data/phone-form-full.log`, `.data/phone-package-ci.log`.
- Ensaio adicional de atualização `v0.1.3` → código `b4678e3`: imagens novas de API e frontend, páginas novas servidas, todas as tabelas preservadas, exame/configuração/TLS/sessão mantidos, nova busca/edição/login aprovados. Backup privado restaurado antes da troca; janela medida 50,84 s sem construção/download. Log `.data/update-phone-package.log`; nenhum volume removido. Esse aceite HTTP complementa o ensaio Chrome anterior.

## Retomada

Pacote U1.3/U1.4 liberado, com roteiro reconstruindo API e web e orientações de busca atualizadas. Próxima melhoria: investigar busca de nomes sem acentos em recorte separado, preservando dados e sem exigir migração para instalar o piloto. Não repetir ensaios aprovados sem mudança/falha. A instalação física assume prioridade quando o usuário enviar os dados do outro Windows.
