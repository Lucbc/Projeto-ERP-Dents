# v0.1.28 — posição dos eventos históricos na agenda

Consolidação em 06/11/2026. [CI 42223686843](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/42223686843) aprovado: produto `aa7c8a6`, 530 frontend, 368 backend (567,658 s), builds/HTTP e seis imagens sem achados. Publicação Git concluída.

## Mudança

- Corrige o deslocamento visual de consultas históricas causado pelo horário de verão do computador de acesso. A agenda continua usando São Paulo.
- Quando o intervalo atravessa uma mudança de offset, o rótulo e o aviso no editor distinguem os horários originais, por exemplo `23:30 UTC-02:00` e `23:30 UTC-03:00`. Horários cotidianos mantêm o formato simples.
- Instantes persistidos, cadastros, permissões e regras de disponibilidade permanecem inalterados. Não acrescenta odontograma ou novos módulos.

## Instalação e atualização

Usar `piloto-cadastros-v0.1.28` no [roteiro Windows](./INSTALACAO-CLINICA-WINDOWS.md) ou no [roteiro de atualização](./ATUALIZACAO-SERVIDOR-WINDOWS.md).

Partindo da v0.1.27, somente código web foi alterado. Sem nova migração, variável, porta, conta ou dependência; revisão do banco permanece `0026_clinical_records`. O roteiro mantém reconstrução das seis imagens para também cobrir versões anteriores. Preservar projeto, configuração, certificados, volumes e backup completo; executar em janela de manutenção e recarregar as abas das estações.

Partindo de versões anteriores à v0.1.25, consultar também as [notas da migração clínica](./ATUALIZACAO-PRONTUARIO-V25.md). Não remover volumes ou aplicar downgrade para contornar erros.

## Aceites e limites

[Relatório 6D.2.2](./homologacao-etapa-6D-2-2.md) separa componentes, Chrome, API e SQL. Instalação assistida para cadastros continua condicionada ao checklist físico. O aceite visual histórico não autoriza criar consultas fora da disponibilidade nem selecionar uma ocorrência arbitrária da hora repetida; entradas ambíguas continuam sendo recusadas. Não houve novo ensaio de instalação Windows nesta entrega.

**Publicação concluída em 06/11/2026:** tag `piloto-cadastros-v0.1.28` = `f6678f48c66ace0adf55a8c993be8f0892b62e51`, publicada e conferida no remoto. Verificador aprovou avanço do checkout limpo v0.1.27. Código de aplicação/scripts/imagens/Compose idêntico ao `aa7c8a6` aprovado no CI. Guias atualizados, instalação assistida para cadastros disponível após checklist físico. **Próximo: 6D.3.1, trilha de alterações de usuários/permissões**, conforme inventário; não repetir 6D.2 sem nova falha. P3 físico prioritário, odontograma posterior.
