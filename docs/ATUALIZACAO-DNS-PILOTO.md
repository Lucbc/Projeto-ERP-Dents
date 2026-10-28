# Manutenção do piloto — dnspython

Preparação em 27/10/2026. Correção de `dnspython` 2.8.0 para 2.9.0, conforme [aviso oficial GHSA-45c3-73f7-pv4m](https://github.com/rthalley/dnspython/security/advisories/GHSA-45c3-73f7-pv4m): mensagem DNS malformada pode provocar consumo excessivo de CPU. A auditoria identificou a dependência afetada; não houve demonstração de exploração no ERP.

## Composição do pacote

- Base `piloto-cadastros-v0.1.23`, commit `5906369`.
- Backport `220117f` na branch `release/pilot-v0.1.24`: somente `requirements.in` e lock com hashes alterados, fixando dnspython 2.9.0. Mesma correção em `main`, commit `2b5b1ae`.
- O piloto permanece na migração 0025. Não inclui tabelas/migração/repositório clínicos em desenvolvimento na `main`. Instalar pelo tag liberado, não pelo HEAD de desenvolvimento.
- Muda somente a imagem API em relação à v0.1.23. Sem configuração ou migração nova; atualização segue o [roteiro existente](./ATUALIZACAO-SERVIDOR-WINDOWS.md), preservando volumes e dados.

## Validação concluída — 28/10/2026

Auditoria Python do lock corrigido sem achados. [CI do pacote](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/40615539827) aprovado no código `220117f`: 493 testes frontend e 336 backend (530,499 s), builds e regressões HTTP. Auditoria das seis imagens sem achados, base de vulnerabilidades de 27/10/2026 às 19:17:44 UTC.

Build local da API e confirmação de dnspython 2.9.0/ausência da migração 0026 aprovados. Cadastros Chrome/API/SQL aprovados: CPF, nascimento, documentos legados, busca, conflitos, permissões, reabertura e preservação de RG; bootstrap, reinício e limpeza também aprovados. Auditoria local das seis imagens sem achados. Logs locais ignorados: `.data/pilot-dns-build.log`, `.data/pilot-dns-registration.log`, `.data/pilot-dns-image-audit.log` e `.data/pilot-dns-ci-final.log`.

Pacote identificado por `piloto-cadastros-v0.1.24`, com guias atualizados. O commit documental da tag sucede o código aprovado sem alterar aplicação/imagens. A tag e a branch do piloto têm histórico próprio; não devem coincidir com o HEAD da main, que contém a migração clínica ainda não liberada.

Atualização física e restauração não foram repetidas nesta manutenção de dependência. O piloto continua restrito aos cadastros; a preparação de prontuário não amplia essa liberação.
