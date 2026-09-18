# Homologação 1D.3.2 — sessão por cookie e HTTPS

## Estado em 18/09/2026

Implementação integrada e testes locais de API/banco/frontend aprovados. **Fechamento pendente da conferência visual com certificado confiável no Chrome e do CI remoto.** O Windows solicitou confirmação interativa da CA local; solicitação encaminhada ao usuário. Não foi ignorado aviso de certificado. O teste HTTPS via biblioteca padrão validou a cadeia com a CA explícita.

Base anterior: `8b17026`. Usuário autorizou executar a fase inteira após a preparação inicial. Contrato/configuração: [sessão e HTTPS](./sessao-e-https.md). Planejamento original: [1D.3.2](./plano-etapa-1D3-2.md).

## Alterações

- JWT transportado exclusivamente por cookie HttpOnly/Secure/host-only, SameSite=Lax; não retornado no login nem persistido em armazenamento JavaScript. A chave antiga é removida. Marcador de sessão sem poder de autenticação substitui a credencial no localStorage.
- Origem HTTPS explícita, desafio anterior a login/bootstrap e token CSRF assinado e vinculado ao cookie em todas as escritas. Requisições protegidas exigem também o marcador da sessão esperada.
- Sessões persistentes/revogação reaproveitadas. Claim de transporte rejeita cookies fabricados a partir de JWTs anteriores; bearer não é aceito. Usuários existentes entram novamente com a mesma senha; nenhuma migração de banco.
- Inicialização por `/api/auth/session`; expiração fornecida pelo servidor, coordenação de login entre abas por Web Locks, cancelamento/descarte de consultas anteriores e limpeza de cache/formulários preservados.
- Logout revoga sem resposta de exclusão de cookie, evitando que resposta antiga apague novo login. Cookie revogado não concede acesso. Falha de rede mantém tela privada oculta e permite repetir saída.
- Serviço `edge` termina HTTPS e preserva o caminho pelo gateway de uploads. Produção publica somente HTTPS; interfaces de diagnóstico de homologação/desenvolvimento restritas ao loopback. Cookies têm nomes diferentes entre os ambientes.
- Scripts HTTP migrados para cookies/CSRF em memória. Novo teste de TLS/cookies incluído no CI, assim como limites do gateway pelo endereço HTTPS. Artefato gerado `tsconfig.tsbuildinfo` deixou de ser versionado.

## Evidências locais

| Verificação | Resultado |
|---|---|
| Backend completo com PostgreSQL/ClamAV reais | 97 testes aprovados; 10 novos testes de cookie/CSRF incluídos |
| Backend focado após tratar Referer malformado | 10 testes aprovados novamente |
| Frontend | 42 testes aprovados, incluindo cabeçalhos, armazenamento, Web Locks, inicialização sem conexão e regressões anteriores |
| TypeScript/Vite e imagens Docker | Builds aprovados; aviso preexistente de chunk acima de 500 kB permanece |
| HTTP de sessões | 12 grupos: login, logout, senha, reset, perfil/status, exclusão e reinício |
| HTTP de erros/autenticação | 10 e 13 grupos aprovados; respostas seguras, validação e limites de tentativas |
| HTTP geral | 10 grupos aprovados: cadastros, agenda, cobrança/baixa e exame |
| Exames/operação/antivírus indisponível | 12, 12 e 9 grupos aprovados; bytes, permissões, quota, concorrência e recuperação |
| HTTPS/cookie real | Cadeia TLS, SPA, flags, CSRF de login, abas antigas e revogação aprovados por `smoke_cookie_homolog.py` |
| Gateway através de HTTPS | 80 requisições de saúde/oito clientes; p95 2,078 s; rejeições 413/503/408 confirmadas |
| Preservação na atualização | Fingerprints das tabelas de negócio e SHA-256 dos arquivos idênticos; login/logout com credenciais existentes aprovados |
| Chrome | Script preparado; primeira tentativa parou na confiança TLS. Aguardando confirmação local da CA, sem bypass |

Os testes locais usam exclusivamente `erp-dents-homolog` e dados fictícios. Cópias prévias de banco/exames e fingerprints ficam em `.data/homolog/pre-1D3-2*`, ignorados pelo Git; não constituem ensaio completo de restauração. Certificados e capturas também são locais.

## Pendências de fechamento

1. Concluir a confiança da CA local no Windows e executar `scripts/smoke_browser_homolog.cjs`, verificando login, duas abas, reload, invisibilidade do cookie ao JavaScript e recuperação de logout.
2. Acompanhar GitHub Actions do commit publicado, corrigindo eventuais falhas antes de declarar a fase concluída.
3. Atualizar este relatório e o ponto de retomada com as evidências finais; confirmar árvore limpa e HEAD igual ao remoto.

## Limites que permanecem em outras etapas

Instalador, resolução do nome/certificados da clínica, renovação, distribuição de confiança, backup/restauração assistidos e atualização permanecem na etapa 5. Navegador precisa suportar Web Locks em contexto seguro; não há fallback silencioso para autenticação insegura. Cookies reduzem exposição da credencial, mas não impedem toda ação de um script malicioso executado na origem. Revisão geral de telas/modais permanece na etapa 3. A produção real não foi implantada.
