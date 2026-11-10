# v0.1.30 — histórico de edições de pacientes

Consolidação em 10/11/2026. Tag: `piloto-cadastros-v0.1.30`.

## Mudanças

- Edições de pacientes registram responsável, instante, versões e nomes dos campos alterados na mesma transação. Não copiam valores pessoais ou clínicos. Salvamentos sem diferença também ficam identificados.
- Tela **Histórico de pacientes** com filtros e paginação, protegida por `patient_audit.view`. Administrador ativo pode consultar; outros perfis precisam de concessão. Não concede acesso ao prontuário nem permite alterar/apagar eventos.
- Registra edições feitas após a implantação. Não reconstrói eventos antigos e não inclui criação, exclusão ou atendimento clínico nessa lista. Odontograma permanece posterior.

## Instalação e atualização

Instalação nova: [roteiro Windows](./INSTALACAO-CLINICA-WINDOWS.md). Instalação existente: [roteiro de atualização](./ATUALIZACAO-SERVIDOR-WINDOWS.md).

A API aplica `0028_patient_audit` sobre 0027, preservando tabelas existentes. Sem nova variável, porta ou credencial. Fazer backup completo conferido, parar API/gateway, reconstruir as seis imagens e preservar projeto/configuração/TLS/volumes. Conferir revisão 0028, login e cadastros antes de reabrir. Não executar downgrade nem usar imagem antiga sobre banco migrado; preservar o estado para análise de recuperação.

## Evidências e limites

- [CI 42670528580](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/42670528580), produto `a296fa9`: 552 frontend, 392 backend (926,054 s), fluxos HTTP e seis imagens sem achados no scanner.
- [Interface e API](./homologacao-etapa-6D-3-2B.md): componentes, Chrome/API/SQL, filtros, paginação, concessão/revogação, falha de rede e regressão de cadastros aprovados.
- [Migração e recuperação](./homologacao-etapa-6D-3-2C.md): preservação das linhas, dump, imutabilidade, backup Windows real, exames/configuração/TLS, Chrome restaurado e reinício aprovados com dados fictícios privados.
- Código da aplicação preserva o produto aprovado no CI. Scripts de recuperação ampliados e executados localmente. Verificação Git não substitui migração ou aceite físico.
- Liberado para instalação assistida de cadastros; iniciar dados reais após checklist na clínica. Demais auditorias continuam no plano e a instalação física ainda não foi executada.

## Publicação verificada

**Publicação concluída — 10/11/2026:** `piloto-cadastros-v0.1.30` = `d13c7e29bb23de10f763a53e0ac3ee692927be93`, publicada e conferida no remoto. Verificador Git aprovou avanço do checkout limpo v0.1.29; aplicação/imagens/Compose idênticos ao produto `a296fa9` aprovado no CI. Guias alinhados à migração 0028. Instalação assistida de cadastros disponível após checklist físico. Próximo: P3 quando houver dados do servidor; enquanto aguardamos, desenhar o recorte de auditoria de leitura clínica/download antes de implementar. Não repetir 6D.3.2 sem nova falha/mudança. Odontograma posterior. Este fechamento substitui as pendências de publicação abaixo.
