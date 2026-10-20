# Checklist para começar os cadastros na clínica

Preparado em 16/10/2026. Usar junto com o [passo a passo de instalação](./INSTALACAO-CLINICA-WINDOWS.md). **Esta ficha está em branco: não comprova que a clínica já foi instalada.** Versão indicada: `piloto-cadastros-v0.1.11`.

O suporte preenche uma cópia fora do Git, por exemplo em `.data/implantacao-clinica.md`. Não incluir senhas, código de ativação, conteúdo de `.env`, dados ou capturas de pacientes. Guardar as credenciais em local próprio.

## 1. Dados a confirmar antes da visita

| Item | Informação atual | Confirmação no local |
| --- | --- | --- |
| Windows do servidor | Estimado Windows 10/11 Home | Edição, versão e build pelo `winver`: ______ |
| Memória | Estimados 16 GB | RAM total e disponível: ______ |
| Docker | Instalação no outro computador ainda não conferida | Engine Linux, WSL/virtualização e recursos: ______ |
| Disco | Não informado | Espaço livre e destino de backup local: ______ |
| Endereço do ERP | Não definido | URL HTTPS e IP reservado: ______ |
| Backup externo | Envio manual semanal para drive na nuvem | Serviço/pasta controlada pela clínica e responsável: ______ |
| Manutenção | Atualizações semanais | Dia, horário e responsável de suporte: ______ |

Conferir os requisitos oficiais pelo roteiro de instalação; a estimativa de Windows/RAM não substitui essa checagem. Quando esses dados estiverem disponíveis, atualizar a ficha; não é necessário enviar senhas.

## 2. Instalação pelo suporte

- [ ] Versão/commit instalado registrado: ______; data: ______.
- [ ] Data/hora do servidor e das estações corretas, com sincronização automática do Windows; as regras de dia da clínica usam São Paulo.
- [ ] Configuração e certificado exclusivos desta clínica; nenhuma conta ou base de homologação copiada.
- [ ] URL HTTPS abre no servidor sem aviso de certificado; `/health` responde.
- [ ] Administrador criado e guardado pelo responsável, sem compartilhamento com a recepção.
- [ ] Uma conta por operador, com Painel/visualizar e Pacientes/visualizar/criar/editar; exclusão e demais módulos desabilitados no perfil de digitação.
- [ ] Segundo computador acessa a mesma URL, com confiança no certificado e atalho no navegador.

## 3. Teste acompanhado em duas estações

Usar somente um registro claramente fictício, sem CPF, por exemplo **TESTE DE INSTALAÇÃO — FICTÍCIO**. Não usar pacientes reais para testar.

- [ ] Operador entra com sua conta e cadastra o registro fictício.
- [ ] Segunda estação localiza, abre e confere esse registro.
- [ ] Uma estação edita uma observação fictícia; a outra recarrega e confere a alteração.
- [ ] Busca por nome social/preferido funciona após preencher esse campo fictício.
- [ ] Perfil da recepção não oferece exclusão nem acesso aos módulos não autorizados.
- [ ] Sair da conta e entrar novamente funciona.

As consultas por CPF e a paginação já passaram em homologação. Não criar CPF de pessoa real ou centenas de registros no servidor da clínica para repetir esse ensaio. Se o registro fictício for mantido, deixá-lo identificado e inativá-lo pelo suporte quando apropriado.

## 4. Backup e reinício — antes dos registros reais

- [ ] Executado backup completo em pasta nova, sem `INCOMPLETE` e com manifesto.
- [ ] Cópia completa guardada fora do disco do servidor, com acesso restrito e envio conferido.
- [ ] Responsável sabe onde está a cópia e quem executa a recuperação assistida. Não testar restauração sobre a instalação ativa.
- [ ] Windows reiniciado; Docker iniciado conforme a rotina combinada e sistema novamente acessível.
- [ ] Segunda estação entra novamente e encontra o registro fictício preservado.
- [ ] Responsável por renovação do certificado definido; vencimento e lembrete registrados.

O backup local diário é recomendado. O envio externo semanal informado pode deixar até cerca de sete dias de registros fora da cópia externa; combinar envio mais frequente durante digitação intensa, se possível. Seguir [backup e recuperação](./BACKUP-RECUPERACAO.md).

## 5. Decisão de início

- [ ] Todos os itens necessários acima aprovados; pendências impeditivas resolvidas.
- [ ] Equipe orientada pela [rotina da recepção](./ROTINA-RECEPCAO-PILOTO.md).
- [ ] Responsável local autoriza o início dos cadastros: ______; data: ______.

**Só depois começar a digitação real.** O piloto cobre cadastro, consulta e edição de pacientes. Agenda, financeiro e prontuário não estão liberados por este aceite.

Se algum item falhar, registrar apenas a etapa e o erro sem dados pessoais, manter os cadastros reais suspensos e corrigir o impedimento. Não apagar volumes, reinstalar por cima ou ignorar aviso de certificado.
