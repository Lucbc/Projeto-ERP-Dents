# 2B.6.4.1 — exclusão de pacientes com confirmação dos exames

**Concluída; fechamento documental em 25/09/2026.** Base `1077f60`, implementação `f8ce0ed`; [contrato](./plano-etapa-2B6-4.md). Banco, API, componentes, Chrome, preservação e CI aprovados em 24/09.

## Mudanças

- Prévia exige permissão de excluir paciente e versão salva. Bloqueia a linha, lê o conjunto, devolve somente identidade/versão/quantidade/fingerprint e encerra a transação antes de responder. Fingerprint SHA-256 canônico inclui paciente, IDs, arquivos, tipos, tamanhos, datas UTC e notas; não depende da ordem da consulta nem somente da quantidade.
- DELETE exige versão positiva e fingerprint. Releitura sob lock recusa `stale_version` ou `stale_exams`; FK impeditiva retorna `linked_record`. Ausência retorna 404 e parâmetros incompletos 422. Nenhuma migração.
- Paciente com exames exige também `exams.delete`, inclusive após prévia vazia ou revogação. Paciente vazio continua exigindo só sua permissão; não exige acesso financeiro. Upload no repositório agora bloqueia o paciente antes de publicar metadados, mantendo a ordem usada pela exclusão individual.
- Fila e exclusão de metadados continuam na mesma transação. Arquivos só são processados depois do commit, com retry durável e proteção de arquivos referenciados. Consultas continuam impeditivas; histórico financeiro e recibos permanecem.
- Modal confirma nome salvo, quantidade de exames, remoção dos arquivos e permanência do financeiro. Falha preserva rascunho e exige recarga explícita/nova prévia/confirmação. Bloqueio contra envio duplo; invalidação local de exames retira a confirmação. Sucesso invalida paciente/listas/exames/agenda/consultas/financeiro.
- Callers de homologação adaptados com helper explícito de prévia para limpeza fictícia; cliente do produto não obtém nova confirmação automaticamente. API/web devem ser atualizados juntos.

## Validação

- **Frontend: 88 testes aprovados** em 85,03s, incluindo confirmação, cancelamento, prévia negada, 409/404/403/503/rede, recarga falha, rascunho e invalidação de exames. Builds API/web aprovados. Primeiras asserções foram ajustadas porque recarga falha oculta a tabela; ausência da ação também impede exclusão.
- **Banco: dez primeiros testes novos aprovados** em 39,421s. Fingerprint, ORM antigo, substituição com mesma quantidade, permissões, locks liberados, parâmetros/ausência, commit recusado, falha de disco/retry, 101 arquivos e disputas com edição/upload/exclusões; financeiro antes/depois da exclusão e inversão de locks da baixa. Ampliados com estados de consulta, criação/reagendamento concorrentes e commit ambíguo; regressão completa de 235 casos aprovada.
- Primeira execução de 22 casos (novos e exames antigos) teve uma falha na expectativa de duas exclusões: outra operação pode ter sido a vencedora e deixar o paciente ausente. Ajustado o teste; não tratar a primeira execução como aprovação integral.
- **HTTP próprio: dez grupos aprovados**, incluindo precondições, edição/upload/troca, autorização/revogação, prévia sem metadados indevidos, paciente vazio, arquivos reais e financeiro pago/estornado/reposto com recuperação do recibo.
- **Chrome HTTPS em duas abas aprovado:** edição de paciente, upload após prévia vazia e troca com mesma quantidade recusados; conta sem permissão impedida de confirmar, concessão explícita e nova confirmação excluem cadastro revisado. Duas capturas conferidas. Primeira tentativa chegou à restrição de conta e falhou na leitura auxiliar de permissões, que omitiu o marcador de sessão; corrigido o script, sem alterar autenticação do produto. Diagnósticos emitidos somente por etapas, nunca cabeçalhos/credenciais.
- **Três testes adicionais aprovados em 8,974s**, cobrindo consultas nos quatro estados, criação/reagendamento × exclusão e commit ambíguo. Total de 13 testes novos aprovados também na regressão completa.
- Cópias públicas/exames/fingerprints `pre-2B6-4-1*` salvos antes da atualização. Helper local `.data/upgrade_2b641.py` comparou todas as linhas de negócio/referências e bytes dos exames; resultado abaixo.

## Atualização principal

- Implementação `f8ce0ed` publicada, HEAD remoto conferido; [CI 36046114839](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/36046114839) aprovado em **16min56s**, com **235 backend em 606,076s e 88 frontend**, regressões HTTP, builds e auditorias. Seis imagens sem achados nessa execução; log local `patient-deletion-ci.log`.
- **235 backend locais aprovados em 650,844s.** HTTPs anteriores de pacientes/referências financeiras/exames/operações de exames aprovados; Chrome financeiro histórico descartável adaptado também aprovado. Limpezas dos navegadores antigos conferidas: pacientes, agenda e versão de consultas aprovados na principal; demais CJS alterados tiveram sintaxe verificada.
- Dump completo `pre-2B6-4-1-full.dump` salvo após zero schemas descartáveis. API/web principais atualizados juntos; revisão `0022_dentist_user_restrict` mantida, nenhuma migração. Dez verificações gerais aprovadas.
- Comparação antes/depois confirmou todas as linhas de negócio, referências históricas e bytes de exames preservados, incluindo após as limpezas dos navegadores. Zero schemas descartáveis; nenhum volume removido. Principal em **https://localhost:18443**; recarregar abas antigas.
- Gateway no CI: 413/503, JSON 408 em 30,011s, vagas liberadas e 80 chamadas de saúde com p95 de 0,0388s. Medição de homologação, sem equivaler a capacidade de produção.
- Fechamento posterior ao CI somente documental, com atualização de R18 e ponto de retomada. Próximo passo: 2B.6.4.2; publicar fechamento e conferir igualdade do HEAD remoto.

## Reprodução

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml build api web
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 -e PYTHONPATH=/app:/app/tests api python -m unittest test_patient_deletion -v
python scripts/smoke_patient_deletion_homolog.py
python scripts/smoke_patient_deletion_browser_homolog.py
```

Testes integrados usam somente schemas/API/arquivos fictícios próprios de `erp-dents-homolog`. Harnesses HTTP/Chrome são sequenciais, portas 18001/18444; TLS com CA confiável. Logs/capturas/cópias/credenciais continuam locais e ignorados pelo Git.

## Limites

SQL administrativo e modificação manual dos arquivos não constituem operações suportadas por essa confirmação. Fingerprint é precondição, não credencial de autorização. Nenhuma mudança de retenção clínica, inativação automática ou migração. **Próximo recorte após fechamento: 2B.6.4.2**, exclusão individual, prévia de imagem e download × limpeza, conforme contrato; não antecipar essa etapa nesta entrega.
