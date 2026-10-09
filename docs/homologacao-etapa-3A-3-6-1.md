# Etapa 3A.3.6.1 — isolamento dos exames por paciente

Em validação, iniciada em 09/10/2026 após a [preparação](./plano-etapa-3A-3-6.md). **Ainda não concluída.**

## Implementação

- Conteúdo da página delimitado pelo ID do paciente: arquivo/notas/progresso/revisão/ações não passam para outro paciente na mesma rota.
- Desmontagem aborta upload, prévias e downloads pendentes; callbacks de upload antigos não mostram avisos, atualizam progresso nem resetam o novo formulário. Leituras de paciente/lista/política recebem AbortSignal.
- Download passa cancelamento ao transporte e não inicia arquivo após cancelamento; mantém anexo octet-stream. Prévia continua restrita a PNG/JPEG, ignora resultado antigo e libera URL ao sair.
- Cancelar upload não presume rollback no servidor; retornar ao paciente original faz uma leitura nova. Sem polling nesta subetapa, sem mudança de API/schema; cabeçalho/revogação/leituras remotas permanecem em 3A.3.6.2.

## Validação

- Componentes: 276 testes/34 arquivos aprovados em 49,80s. Inclui os dois defeitos inicialmente reproduzidos, A/B/A, erro/progresso/sucesso tardios, cancelamento de bytes e leituras, URL liberada e exclusão antiga sem fechar a confirmação nova. Teste do adaptador verifica cancelamento real do sinal composto pelo transporte, sem exigir identidade entre objetos AbortSignal.
- Build TypeScript/Vite aprovado em 28,67s; aviso existente de bundle acima de 500kB. Auditorias npm/Python aprovadas.
- Backups locais `pre-3A-3-6-1*` preservados. Helper `.data/upgrade_3a361.py`: somente `after` daqui em diante.
- Pendentes: imagem web, Chrome com troca de parâmetro sem recarregar documento e upload confirmado no servidor antes de resposta retida, regressão de bytes/prévia/exclusão, imagens/CI, atualização somente web/HTTPS/smoke/preservação/publicação. Testes de componentes não provam API/banco/Chrome.

## Retomada

Concluir todos os aceites antes de 3A.3.6.2. Não repetir testes aprovados sem mudança/falha. Usar apenas `erp-dents-homolog`, dados fictícios e schemas privados; manter volumes e não publicar dados/segredos/logs locais.


### Complemento de retorno ao paciente

Chrome identificou cache global de 15s impedindo a leitura do upload já gravado quando o usuário voltava rapidamente ao paciente original. Complemento `5d4d2c5`: cabeçalho/lista leem ao montar mesmo com cache recente; teste de isolamento usa o frescor real e verifica A/B/A. 22 testes focados e build final 11,25s aprovados. CI final `37978598105`, anterior cancelado; Chrome final e atualização/preservação ainda pendentes.
