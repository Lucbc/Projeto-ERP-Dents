# Atualização curl/libcurl — 26/10/2026

## Início e motivo

Base `1ddf8d2`, árvore inicialmente limpa. Antes de integrar o fuso da agenda, o [CI 40259611481](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/40259611481) aprovou 479 testes frontend, 328 backend (769,054 s), builds e HTTP, mas recusou imagens: web/gateway/edge com 2 HIGH, 2 MEDIUM e 44 LOW cada; clamav com 1 HIGH, 1 MEDIUM e 22 LOW. API e banco sem achados.

A auditoria local inicialmente usou uma base de vulnerabilidades de 25/10, ainda dentro do prazo automático do Trivy. Após limpar somente esse cache de vulnerabilidades e baixar a base atual, reproduziu os mesmos resultados. Isso não removeu imagens, volumes, banco ou dados de homologação.

Os achados estão em curl/libcurl 8.22.0-r0; correção disponível no Alpine em 8.23.0-r0, confirmada por `apk policy`. Incluem CVE-2026-92392 (HIGH) e CVE-2026-92388 (MEDIUM na classificação do scanner). [Avisos oficiais do curl](https://curl.se/docs/vuln-8.22.0.html). Não suprimir CVEs nem reduzir a política de reprovação HIGH/CRITICAL.

## Alterações

- Fixar curl e libcurl 8.23.0-r0 nas receitas da web e dos proxies, e somente libcurl no antivírus, que não precisa do executável curl.
- `audit_images.py` passa a registrar identificador, pacote, versão instalada/corrigida e severidade dos achados HIGH/CRITICAL/MEDIUM, além das datas da base de vulnerabilidades. Não imprime configuração de imagens, ambiente ou saída bruta do scanner.
- Sem alteração de API, schema, configuração, entrypoints ou caminhos de dados. A base de conversão clínica permanece sem integração às telas.

## Aceites e publicação

Em andamento: construir as quatro imagens, auditar as seis com base atualizada, validar cadastros na web corrigida e conferir CI (incluindo proxies/antivírus). Não repetir testes locais já aprovados da conversão clínica; seu módulo não mudou.

Logs locais, fora do Git: `.data/clinic-time-ci-failed.log`, `.data/clinic-time-image-audit-fresh.log`, `.data/curl-runtime-build.log`.

Instalação permanece v0.1.20 até o fechamento; destino previsto v0.1.21. Atualizar guias após os aceites, publicar tag e conferir HEAD/main/tag remoto e árvore limpa. Instalação física ainda pendente. Próximo trabalho funcional continua 3B.3B.2: integrar entrada, duração, filtros e calendário no mesmo fuso.
