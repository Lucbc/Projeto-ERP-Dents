# Homologação — etapas 0 e 1A

Data: 15/09/2026. Windows, Docker Engine 29.8.0, projeto exclusivo `erp-dents-homolog`, dados fictícios.

## Resultado

Etapas 0 (base integrada) e 1A (isolamento e contexto de build) concluídas. Isso permite iniciar as correções funcionais; não representa aprovação para uso clínico real.

## Mudanças

- Compose exclusivo, portas 127.0.0.1:18080 (web) e 127.0.0.1:18000 (API), PostgreSQL sem porta publicada e volumes próprios.
- Script PowerShell gera segredos uma vez e oferece up/status/logs/stop. Stop preserva dados. Tratamento do código de saída evita interpretar progresso normal em stderr como falha no PowerShell 5.
- Nomes padrão distintos nos Compose de produção e desenvolvimento. README orienta preservação dos volumes de instalações anteriores.
- Contextos de build excluem ambientes locais, dependências geradas, caches e arquivos de ambiente conforme cada aplicação.
- Removido BOM UTF-8 do nginx.conf, que impedia iniciar. Build agora executa `nginx -t`; EditorConfig define UTF-8 sem BOM.
- Plano e instruções de retomada persistidos no repositório.

## Evidências

| Verificação | Resultado |
|---|---|
| Build API/web | Concluídos; configuração Nginx aprovada |
| Migrações em banco vazio | Sete aplicadas; `alembic current` confirmou `0007_financial_patient (head)` |
| Bootstrap/login | Administrador criado e identidade conferida; segundo bootstrap retornou 409; acesso anônimo retornou 401 |
| Cadastros | Especialidade, dentista, procedimento e paciente criados; edição conferida |
| Agenda | Consulta criada com procedimento; conflito sequencial retornou 409; próxima consulta conferida |
| Perfis | Recepção acessou pacientes e recebeu 403 em usuários; matriz de permissões consultada |
| Financeiro | Cobrança de R$ 150 criada, duplicação sequencial negada, baixa e resumo conferidos |
| Exames | PNG fictício enviado, listado e baixado com igualdade exata dos bytes |
| Primeiro smoke | 11 verificações; limpeza dos registros criados preservou administrador e volumes |
| Segundo smoke | 9 verificações; registros fictícios mantidos para inspeção |
| Chrome | Login, painel, pacientes e financeiro abriram; cobrança paga visível, inclusive após reload pós-reinício |
| Reinício dos três serviços | Novo login funcionou; paciente/data armazenada, vínculo da consulta, cobrança paga e bytes do exame preservados |
| Isolamento | Compose resolvido aponta volumes distintos com prefixos erp-dents-prod, erp-dents-dev e erp-dents-homolog |
| Contexto/imagem | Exclusões conferidas; imagem API sem /app/.venv; imagem final web recebe dist/config |
| Volumes existentes | Dois volumes de homologação criados; gest-o-casa_postgres-data preservado |
| Segredos e sintaxe | Arquivos de segredos ignorados pelo Git; parser PowerShell sem erro |

Teste reproduzível: `scripts/smoke_homolog.py`, Python 3, biblioteca padrão. Neste computador:

```powershell
./apps/api/.venv/Scripts/python.exe ./scripts/smoke_homolog.py
```

O teste valida projeto/porta antes de escrever. `--keep-fixtures` mantém registros fictícios para inspeção; execução padrão remove apenas seus próprios registros. Resultado local em `.data/homolog/last-smoke.json`.

## Problemas observados e limites

- Nascimento armazenado em 1990-01-15 aparece como 14/01/1990 na lista. Correção prevista na etapa 3.
- Financeiro tem rolagem horizontal e conteúdo à direita fora do viewport observado. Revisar responsividade na etapa 3.
- Inspeção de interface pontual; não executados todos os formulários e perfis pelo navegador.
- Conflitos testados foram sequenciais. Concorrência, carga, revogação de sessões, restauração de backup e instalação em outra máquina continuam pendentes.
- Reinício de containers não substitui teste de restauração nem reinício do computador/serviço Docker.
- HTTP local e dados fictícios. Instalação em rede, HTTPS e operação assistida pertencem à etapa 5.

## Acesso e próximo passo

Interface: http://localhost:18080. Credenciais fictícias em `.data/homolog/admin.json`, arquivo local ignorado pelo Git. Não publicar o conteúdo.

Próxima entrega: **1B — sessão e cache no navegador**.
