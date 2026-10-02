# Verificação 3A.3.1.1 — fundação de permissões compartilhadas

Início em 02/10/2026, base `249b605`. [Contrato e ajuste de integração](./plano-etapa-3A-3.md). **Provider ainda não montado no aplicativo**: entrega de infraestrutura e testes, sem afirmar atualização global nas telas. Ativação depende da integração dos guards na 3A.3.1.2 para não desmontar rascunhos em falha transitória.

## Implementação

- `use-effective-permissions.tsx`: um `EffectivePermissionsProvider` por sessão, dentro de seu QueryClient e fora dos guards; consumidores acessam contexto, sem novos observadores ou temporizadores. Provider aninhado e consumidor sem provider falham explicitamente.
- Reutiliza leitura 15s/60s, pausa/retorno/conexão/manual e cancelamento do `useLiveQuery`. Chave `permissions/me/usuário`, negação limpa somente essa chave, descarte ao desmontar; identidade/perfil/vínculo delimitam o leitor. Nenhuma escrita ou API nova.
- Todos os perfis, inclusive administrador, precisam de leitura validada para obter autoridade. Anônimo não consulta. Erro transitório não expõe matriz antiga; negação não concede ações. Perfil divergente tem estado específico sem matriz/versão utilizável.
- Estado de verificação separado de conectividade/leitura em andamento. Revalidar em segundo plano não apaga autoridade verificada antes de uma resposta de falha. Concessão/revogação na matriz não desmontam consumidores por iniciativa do provider; quem aplica a barreira visual e limpa rascunhos confirmadamente revogados será a integração seguinte.
- Hook legado, guards, menu, painel, consulta e demais telas não alterados. A fundação não deve ser montada em paralelo aos leitores atuais: a migração coordenada pertence à 3A.3.1.2.

## Evidência e limites

| Camada | Resultado |
| --- | --- |
| Componentes | 16 testes novos aprovados: múltiplos consumidores e montagem adicional sem GET, quatro perfis, anônimo, revogação/concessão sem escrita, rascunho do consumidor intacto, falha inicial/transitória/backoff/manual, pausa/retorno/reconexão/foco, leitura lenta sem sobreposição, 401/403 isolados, divergência de perfil, cancelamento/resposta antiga, exigência de provider |
| Build | TypeScript/Vite aprovados; aviso existente de bundle >500kB permanece |
| Regressão frontend | 169 testes em 25 arquivos aprovados em 32,08s, incluindo agenda/painel/consulta e fluxos versionados existentes |
| API/banco | Sem mudança ou novo teste específico. O leitor usa serviço existente; respostas de componentes são simuladas. Não alegar logout HTTP ou proteção transacional nova |
| Chrome/ambiente principal | Sem ativação, rebuild/reinício ou migração da homologação. Interface real e preservação após ativação serão verificadas na 3A.3.1.2 |
| CI | Pendente publicação/execução completa |

Logs locais em `.data/tests-3a311-focused.log`, `.data/frontend-full-3a311.log` e `.data/build-3a311.log`, ignorados pelo Git. Nenhuma credencial/dado local incluído. Testes usam apenas fixtures fictícias.

## Próximo passo

Concluir regressão/CI e publicar fechamento. Depois implementar 3A.3.1.2: integrar a fonte única no aplicativo, migrar consumidores de permissões e leitores locais juntos, preservar rascunhos ocultos em falha transitória, limpar dados na revogação confirmada e revalidar identidade divergente. Testar administrador revogado pelo transporte real e menu/rota/ações coerentes; só então ativar na homologação. R19 continua parcial.
