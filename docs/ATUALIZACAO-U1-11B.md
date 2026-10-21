# U1.11B — navegação interna com formulário de paciente pendente

## B.2 — concluída em 21/10/2026

Versão liberada: `piloto-cadastros-v0.1.14`.

Tabela de rotas migrada para data router, mantendo as proteções de acesso. A instância nasce e é descartada dentro do limite de sessão existente; não compartilhar navegação bloqueada entre logins. O cadastro usa confirmação própria, com foco inicial em continuar preenchendo, Escape para permanecer e saída desabilitada durante operações em andamento. Se a operação termina com sucesso, a decisão pendente é cancelada; nenhuma navegação automática após salvar.

47 testes focados de pacientes/permissões/bloqueador e build aprovados (`.data/history-components.log`, `.data/history-build.log`). Frontend completo: 414 testes em 47 arquivos, 123,08 s (`.data/history-frontend.log`). Chrome/API/SQL de Voltar/Avançar aprovado (`.data/history-browser.log`), incluindo repetição de Voltar, permanência de campos quando recusado e ausência de gravações automáticas.

Expiração real com decisão aberta aprovada (`.data/history-expiry.log`): formulário e diálogo descartados, cookie antigo recusado, novo login limpo, SQL sem gravações. Revogação real/troca de identidade aprovadas (`.data/history-session.log`), com decisão aberta, cancelamento de requisição antiga, 32 s sem consultas privadas no login e novo perfil respeitado. Confirmação conferida visualmente na imagem fictícia `.data/homolog/patient-navigation-confirmation.png`.

Falhas de rede em Chrome/API/SQL aprovadas (`.data/history-network.log`): sair desabilitado durante POST retido; após resultado desconhecido, aceitar navegação e retornar mantém identificador da tentativa, sem campos persistidos; recarga e conferência recuperam o comprovante. Sem duplicação, fila offline ou alteração nas regras de edição.

Código `045d351`, [CI 39583709740](https://github.com/Lucbc/Projeto-ERP-Dents/actions/runs/39583709740) aprovado: 325 testes backend, 414 frontend, builds, HTTP, auditoria de pacotes e seis imagens sem achados (`.data/history-ci-final.log`). Chrome ampliado para criação/edição nas duas direções aprovado (`.data/history-browser-final.log`), incluindo repetição de Voltar e Avançar com decisão aberta. Regressão de fechamento/recarga U1.11A aprovada na imagem atual (`.data/history-unsaved.log`), com conferência SQL de somente um cadastro explicitamente salvo. Guias de instalação/atualização e rotina da recepção atualizados para v0.1.14. Sem migração, mudança de API, dependências ou configuração; ensaio operacional U1.9 não repetido.

## B.1 — diagnóstico concluído em 21/10/2026

Base `5ebf97c`, pacote `piloto-cadastros-v0.1.13`. Esta subetapa acrescenta um roteiro reproduzível de diagnóstico; **não corrige a navegação nem libera nova versão**. A proteção de Cancelar/X/fundo e recarga da U1.11A permanece disponível.

### Evidências

Executados `scripts/diagnose_patient_history_homolog.py` e `.cjs` com Chrome real, API e PostgreSQL privados de `erp-dents-homolog`, dados exclusivamente fictícios. Log local `.data/patient-history-diagnosis.log`; relatório `.data/homolog/last-patient-history-diagnosis.json`.

| Camada/cenário | Resultado observado |
| --- | --- |
| Interface: Painel → Pacientes → Novo → preencher → Voltar | Retorna ao Painel sem confirmação; ao Avançar e abrir Novo, campos vazios |
| Interface: Pacientes → Painel → Voltar → Editar → alterar → Avançar | Retorna ao Painel sem confirmação; ao Voltar e editar novamente, aparecem os valores gravados anteriormente |
| Documento | Marcador em memória preservado durante ambos os percursos: são navegações internas, sem recarga, por isso `beforeunload` não as protege |
| Rede/API | Zero POST/PUT/DELETE de pacientes após criar a fixture; GET posterior mantém observação e versão originais |
| PostgreSQL direto | Um paciente fictício da fixture, observação original e versão 1; zero comprovantes de criação |
| Armazenamento do navegador | Nenhum campo fictício do rascunho em localStorage/sessionStorage |
| Isolamento | Bootstrap/reinício/limpeza aprovados; recursos temporários removidos, containers principais e volumes preservados |

O roteiro espera o defeito da v0.1.13. Não executá-lo como aceite da correção futura: criar um roteiro de aceitação separado que espere bloqueio e escolha explícita.

### Causa e desenho da correção B.2

`apps/web/src/App.tsx` usa `BrowserRouter`/`Routes`; ao mudar a rota, o formulário de pacientes desmonta. O bloqueador oficial `useBlocker` exige o contexto de um data router na versão instalada 7.18.4 (confirmado no código local da dependência). Ele fornece estados e ações para permanecer ou prosseguir na navegação interna; recargas continuam cobertas pelo aviso da U1.11A. [Referência oficial](https://reactrouter.com/api/hooks/useBlocker).

Proposta para B.2: migrar a mesma tabela de rotas para `createBrowserRouter`/`RouterProvider`, mantendo as proteções de acesso e o limite de remontagem por sessão; acrescentar confirmação própria para sair do formulário pendente. Não manipular `history.pushState`/`popstate` manualmente, nem salvar rascunhos em armazenamento persistente. Não usar confirmação nativa síncrona para decidir a navegação interna; a aplicação deve continuar processando revogação e expiração enquanto a escolha estiver aberta.

### Aceites obrigatórios de B.2

1. Voltar e Avançar, tanto criando quanto editando: permanecer conserva todos os campos; sair segue a rota pretendida e descarta somente alterações não salvas.
2. Formulário intacto e edição revertida aos valores originais não bloqueiam navegação. Salvamento confirmado remove a proteção.
3. Cliques repetidos em Voltar/Avançar enquanto a confirmação está aberta não misturam destino, URL e conteúdo nem duplicam diálogos. Verificar também navegação por link.
4. Durante salvamento em andamento, preservar a operação e não apresentar fechamento como cancelamento do envio. Resultado desconhecido mantém a tentativa e sua conferência após voltar à página.
5. Expiração, revogação e novo login removem formulário/confirmação/requisições anteriores, mesmo com decisão pendente. O bloqueador não pode impedir uma remoção de acesso.
6. Regressão de rotas, permissões e navegação autenticada/anonimizada. Adaptar os testes de pacientes ao mesmo tipo de roteador; nenhum atalho no código de produção apenas para testes.
7. Chrome/API/SQL distinguem permanência do rascunho, gravação explícita e ausência de gravação automática; regressões U1.11A e U1.9 preservadas. Build, frontend e CI completos antes de nova tag.

### Retomada histórica de B.1 (superada pela conclusão B.2 acima)

Próximo: implementar B.2 a partir desse diagnóstico, sem repetir a reprodução inteira. Sem alteração funcional, migração ou configuração nesta entrega. Roteiros de instalação permanecem v0.1.13 e já informam o limite de Voltar/Avançar. CI do commit/tag v0.1.13 também confirmado: execuções `39537830091` e `39537830143` aprovadas. A instalação física P3 continua prioritária assim que chegarem os dados do servidor.
