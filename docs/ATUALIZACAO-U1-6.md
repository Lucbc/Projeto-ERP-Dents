# U1.6 — prevenção de cadastros duplicados

## U1.6A — diagnóstico concluído em 16/10/2026

Base `f00d889`, aplicação da versão `piloto-cadastros-v0.1.5`. Nenhuma alteração funcional nesta subetapa; versão de instalação preservada.

### Evidência reproduzida

`scripts/diagnose_patient_duplicates_homolog.py` dentro da API, com `RUN_HOMOLOG_TESTS=1`, usa a fixture de schema exclusivo de `erp-dents-homolog`. Dados exclusivamente fictícios; o diagnóstico imprime apenas resultados, remove seu schema e preserva os volumes. Log local ignorado `.data/patient-duplicates-diagnosis.log`.

| Caso | Resultado atual |
| --- | --- |
| Criar duas pessoas com CPF equivalente, com/sem pontuação | Ambos aceitos; a busca normalizada encontra os dois |
| Editar um terceiro cadastro para o mesmo CPF | Aceito; os dois registros anteriores permanecem intactos |
| Criar simultaneamente em duas conexões com o mesmo CPF | Ambos aceitos |
| Mesmo nome, nascimentos diferentes, sem CPF | Ambos aceitos; esse caso legítimo precisa continuar permitido |

Foi executado caso de uso + repositório + PostgreSQL real em schema privado. **Não é teste HTTP nem de interface.** Não se trata de teste de regressão exigindo que o defeito permaneça: o script é diagnóstico histórico explícito, fora da descoberta automática de testes.

### Causa verificada por leitura

- `PatientUseCases` remove espaços nas pontas do CPF, sem verificar equivalência ou duplicidade.
- Coluna `patients.cpf` tem índice comum, sem unicidade; a busca normalizada não impede gravações repetidas.
- O formulário envia a criação/edição sem conferência de possíveis duplicados. CPF continua opcional.
- Nome igual, telefone compartilhado e ausência de CPF não identificam uma pessoa de forma suficiente para bloquear cadastro ou mesclar registros.

## Próximo recorte — U1.6B: aviso antes de criar

Implementar aviso não bloqueante de possível duplicidade, inicialmente por CPF equivalente completo e/ou nome completo com nascimento igual. Mostrar apenas dados necessários para conferência, respeitando permissão de visualizar pacientes. Não comparar só os primeiros 100 registros nem usar a busca genérica como prova de correspondência exata. Não sinalizar o próprio registro numa futura extensão para edição.

Critérios: conferir cadastro existente, permitir homônimos legítimos e ausência de CPF, preservar rascunho, descartar resposta de consulta antiga quando o formulário mudar, não afirmar ausência de duplicidade se a consulta falhar, não gravar/mesclar automaticamente. Validar componentes, HTTP/banco e Chrome com conta de recepção. Nenhuma alteração de regra de bloqueio nesta primeira parte.

## Recorte posterior — proteção de CPF na gravação

Antes de bloquear CPF equivalente, definir tratamento de CPF inválido/histórico, inativos e duplicidades existentes. Inspecionar somente contagens em ambiente autorizado, sem exportar documentos ou dados pessoais. Não adicionar índice único que impeça a atualização de uma instalação com duplicados, nem alterar/remover CPF histórico automaticamente.

Uma consulta prévia isolada não resolve duas gravações simultâneas. A proteção deve garantir atomicidade no banco, retornar conflito compreensível e preservar o rascunho, cobrindo criação e edição. Planejar migração e ensaio de atualização próprios se necessários; não condicionar a instalação do piloto a esse recorte.

## Retomada

Implementar U1.6B, mantendo as limitações explícitas até os aceites. A versão v0.1.5 continua liberada para instalação assistida de cadastros; consultar antes de cadastrar. Ao receber os dados do computador da clínica, priorizar instalação física P3.
