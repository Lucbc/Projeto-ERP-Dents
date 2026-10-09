# Etapa 3A.3.5.2 — matrizes administrativas

Iniciada em 09/10/2026, base `4d7276a`. **Em validação; ainda não concluída.**

## Mudanças

- Leitura administrativa com política compartilhada de 15s/60s, pausa/retorno, cancelamento, atualização manual e última leitura identificada.
- Aviso de versão remota também no perfil recolhido. Cada rascunho e versão capturada permanecem intactos; recarga explícita substitui somente o perfil escolhido. Salvar ainda usa a versão capturada, sujeita à rejeição do servidor; conflito/resultado incerto exige revisão explícita.
- Negação administrativa desmonta as matrizes, cancela leituras e ignora recargas/respostas tardias. Limpeza limitada a `permissions/roles`, sem remover o leitor global `permissions/me`.
- Sem alterações de API, schema ou migrações.

## Validação e pendências

- Componentes: 268 testes frontend aprovados antes do caso adicional de revisão após polling; build TypeScript/Vite aprovado. Caso adicional aprovado na suíte focada (seis casos).
- Docker web construído; auditoria de pacotes aprovada. Chrome novo e auditoria das imagens em execução. Backups `pre-3A-3-5-2*` preservados; helper local `.data/upgrade_3a352.py`, somente `after` daqui em diante.
- Ainda pendentes: Chrome com sessões independentes, regressão de versões, auditoria final, CI, atualização somente web/HTTPS/smoke/preservação e fechamento. Testes de componentes não equivalem à homologação de interface/API/banco.

## Retomada

Conferir resultados locais, publicar implementação e acompanhar CI. Somente concluir após todos os aceites do [plano](./plano-etapa-3A-3.md). Próximo recorte depois desta conclusão: 3A.3.6, exames e cabeçalho do paciente; R19 permanece parcial.


## Checkpoint publicado

Implementação `ca71526`; ajuste de contraste `e81d975`. Chrome novo aprovado (15038ms, duas sessões independentes, duas escritas explícitas, conflito 409 real, falha/recarga/pausa, 403 simulado e revogação real); regressão Chrome de versões aprovada. Seis imagens sem achados antes do ajuste visual. Build final 10,35s e imagem web aprovados. CI final `37942637860`, Chrome/capturas e auditoria finais em execução; principal ainda não atualizada. Não confundir o 403 simulado da interface com teste de autorização real; a API existente mantém seus testes de autorização no CI.
