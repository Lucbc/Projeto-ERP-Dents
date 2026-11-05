# 6D.1 — R21 residual: nomes e flags de cadastros

05/11/2026, produto `e4ec7e7`. Preparação independente durante o CI de 6C.2. **Diagnóstico HTTP/SQL concluído neste recorte; nenhuma correção funcional necessária para impedir erro 500 ou perda de dados nos casos abaixo.**

| Recurso | Nome explicitamente null | active explicitamente null | Campo obrigatório omitido | Limpeza opcional |
| --- | --- | --- | --- | --- |
| Pacientes | 400 | 422 | Valores preservados | notes=null salva vazio |
| Dentistas | 400 | 422 | Valores preservados | phone=null salva vazio |
| Procedimentos | 400 | 422 | Valores preservados | description=null salva vazio |
| Especialidades | 400 | 422 | Valores preservados | Não ensaiada: sem campo opcional neste recorte |

As oito escritas recusadas preservaram a linha SQL inteira. Omissão manteve nome/active; limpeza opcional foi conferida no banco e a versão persistida correspondeu à resposta. Usou schema/API temporários de `erp-dents-homolog`, dados fictícios, bootstrap/reinício/limpeza aprovados, recursos principais preservados. Harness `scripts/diagnose_required_null_homolog.py`, log local `.data/required-null-accepted.log`, tabela de resultados local `.data/homolog/required-null-diagnosis.json` (somente nomes técnicos/status).

## Por que o achado antigo não se repete aqui

Os casos de uso rejeitam nomes vazios/nulos. Flags nulas ainda são aceitas pelo schema de entrada, mas a restrição do banco e o tratamento comum de erro (`error_boundary.py`, estados 23502/23514) devolvem 422 com rollback. Validar antes do banco daria mensagem mais específica, porém não é um bloqueador de cadastro demonstrado. Não mudar esse contrato apenas para aumentar cobertura.

Na inspeção, `user_use_cases.py` já rejeita null de name/email/role/is_active; este relatório não declara novo teste HTTP de usuários. A primeira expectativa do harness para active era 500, baseada no achado histórico; foi corrigida para o 422 efetivamente observado. Isso foi ajuste do diagnóstico, não falha do produto.

## Limites e próximo passo

Não encerra R21 globalmente: campos financeiros, listas, limites de texto e outras entradas exigem recortes próprios se houver risco/prioridade demonstrados. Não há aceite novo de interface nesta etapa, migração ou mudança do instalador. Preservar a fila de cobertura histórica/multidia da agenda e o odontograma futuro mapeado; P3 físico continua prioritário.
