# 2B.6.4.1 — exclusão de pacientes com confirmação dos exames

**Em validação em 24/09/2026.** Base `1077f60`; [contrato](./plano-etapa-2B6-4.md). Não declarar conclusão antes de regressão/Chrome/preservação/CI.

## Mudanças

- Prévia exige permissão de excluir paciente e versão salva. Bloqueia a linha, lê o conjunto, devolve somente identidade/versão/quantidade/fingerprint e encerra a transação antes de responder. Fingerprint SHA-256 canônico inclui paciente, IDs, arquivos, tipos, tamanhos, datas UTC e notas; não depende da ordem da consulta nem somente da quantidade.
- DELETE exige versão positiva e fingerprint. Releitura sob lock recusa `stale_version` ou `stale_exams`; FK impeditiva retorna `linked_record`. Ausência retorna 404 e parâmetros incompletos 422. Nenhuma migração.
- Paciente com exames exige também `exams.delete`, inclusive após prévia vazia ou revogação. Paciente vazio continua exigindo só sua permissão; não exige acesso financeiro. Upload no repositório agora bloqueia o paciente antes de publicar metadados, mantendo a ordem usada pela exclusão individual.
- Fila e exclusão de metadados continuam na mesma transação. Arquivos só são processados depois do commit, com retry durável e proteção de arquivos referenciados. Consultas continuam impeditivas; histórico financeiro e recibos permanecem.
- Modal confirma nome salvo, quantidade de exames, remoção dos arquivos e permanência do financeiro. Falha preserva rascunho e exige recarga explícita/nova prévia/confirmação. Bloqueio contra envio duplo; invalidação local de exames retira a confirmação. Sucesso invalida paciente/listas/exames/agenda/consultas/financeiro.
- Callers de homologação adaptados com helper explícito de prévia para limpeza fictícia; cliente do produto não obtém nova confirmação automaticamente. API/web devem ser atualizados juntos.

## Validação em andamento

- **Frontend: 88 testes aprovados** em 85,03s, incluindo confirmação, cancelamento, prévia negada, 409/404/403/503/rede, recarga falha, rascunho e invalidação de exames. Builds API/web aprovados. Primeiras asserções foram ajustadas porque recarga falha oculta a tabela; ausência da ação também impede exclusão.
- **Banco: dez primeiros testes novos aprovados** em 39,421s. Fingerprint, ORM antigo, substituição com mesma quantidade, permissões, locks liberados, parâmetros/ausência, commit recusado, falha de disco/retry, 101 arquivos e disputas com edição/upload/exclusões; financeiro antes/depois da exclusão e inversão de locks da baixa. Ampliados com estados de consulta, criação/reagendamento concorrentes e commit ambíguo; regressão completa em andamento, esperado 235 casos.
- Primeira execução de 22 casos (novos e exames antigos) teve uma falha na expectativa de duas exclusões: outra operação pode ter sido a vencedora e deixar o paciente ausente. Ajustado o teste; não tratar a primeira execução como aprovação integral.
- **HTTP próprio: dez grupos aprovados**, incluindo precondições, edição/upload/troca, autorização/revogação, prévia sem metadados indevidos, paciente vazio, arquivos reais e financeiro pago/estornado/reposto com recuperação do recibo.
- **Chrome HTTPS em duas abas aprovado:** edição de paciente, upload após prévia vazia e troca com mesma quantidade recusados; conta sem permissão impedida de confirmar, concessão explícita e nova confirmação excluem cadastro revisado. Duas capturas conferidas. Primeira tentativa chegou à restrição de conta e falhou na leitura auxiliar de permissões, que omitiu o marcador de sessão; corrigido o script, sem alterar autenticação do produto. Diagnósticos emitidos somente por etapas, nunca cabeçalhos/credenciais.
- **Três testes adicionais aprovados em 8,974s**, cobrindo consultas nos quatro estados, criação/reagendamento × exclusão e commit ambíguo. Total de 13 testes novos aprovados em execuções focadas; regressão completa ainda em andamento.
- Cópias públicas/exames/fingerprints `pre-2B6-4-1*` salvos. Principal ainda não atualizada; revisão `0022`. Fazer dump completo após zero schemas e antes de atualizar API/web. Helper local `.data/upgrade_2b641.py` compara todas as linhas de negócio/referências e bytes dos exames.

## Comandos

```powershell
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml build api web
docker compose --project-name erp-dents-homolog --env-file .env.homolog -f docker-compose.homolog.yml run --rm --no-deps -e RUN_HOMOLOG_TESTS=1 -e PYTHONPATH=/app:/app/tests api python -m unittest test_patient_deletion -v
python scripts/smoke_patient_deletion_homolog.py
python scripts/smoke_patient_deletion_browser_homolog.py
```

Testes integrados usam somente schemas/API/arquivos fictícios próprios de `erp-dents-homolog`. Harnesses HTTP/Chrome são sequenciais, portas 18001/18444; TLS com CA confiável. Logs/capturas/cópias/credenciais continuam locais e ignorados pelo Git.

## Limites

SQL administrativo e modificação manual dos arquivos não constituem operações suportadas por essa confirmação. Fingerprint é precondição, não credencial de autorização. Nenhuma mudança de retenção clínica, inativação automática ou migração. **Próximo recorte após fechamento: 2B.6.4.2**, exclusão individual, prévia de imagem e download × limpeza, conforme contrato; não antecipar essa etapa nesta entrega.
