@AGENTS.md

# MKT Hub 2

Sistema de gestão do time de marketing do Grupo SB (SeuBoné, Onevo, Carbone Educação, Weevo).
Sucessor do MKT Hub atual (repo `mktimer`). Substitui o ClickUp e, depois, absorve o sistema antigo.

**Antes de mexer, leia [docs/01-analise-e-arquitetura.md](docs/01-analise-e-arquitetura.md).**
Ele traz a análise, os 11 achados de UX, o corte de MVP e o design system — e as decisões já aprovadas.
Para estágios, empresas ou campos de tarefa, confira antes
[docs/02-clickup-house-quatro5.md](docs/02-clickup-house-quatro5.md): é o levantamento do board real
que o MVP precisa substituir.

## Doutrina

> Máxima clareza com o mínimo de complexidade.

Prioridade em caso de conflito:
**Funcionalidade → Clareza → Simplicidade → Experiência → Escalabilidade → Estética.**

Antes de criar qualquer coisa: *"isso realmente precisa existir?"* Se o mesmo problema se resolve com
menos cliques, menos telas ou menos código, a solução menor vence.

Mudança relevante de produto nunca acontece em silêncio. Proponha antes:
**Problema → Solução pedida → Melhoria → Benefício → Impacto técnico.**

## Decisões aprovadas

0. **Data de corte do ClickUp: 07/09/2026.** A partir dela, tarefa nova nasce só aqui. O que estava
   em andamento lá termina lá. Enquanto os dois convivem, `npm run clickup:sincronizar` alinha a
   etapa — depois do corte, isso deixa de ser necessário. **Atenção:** 07/09 é feriado, então a
   semana do corte tem quatro dias úteis e o teto real de todos é 80% da meta semanal.
1. **Ponte, não big bang.** O sistema novo vai expor leitura no formato que o MKT Hub atual já
   consome do ClickUp, para a pontuação semanal não quebrar durante a migração.
2. **Tarefas primeiro.** MVP substitui o ClickUp. Rotinas, metas e coins vêm na V1.5.
3. **Entidade única.** Tarefa, conteúdo e captação são o mesmo `work_items`, separados por `type`
   e por pipeline. Rotina é gerador de itens, não entidade paralela.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · Drizzle + Postgres (Supabase) ·
Zod · jose + bcryptjs para sessão · Vercel.

Sem Redis, sem WebSocket, sem backend separado, sem ORM pesado. Cada dependência nova é peso
permanente — antes de sugerir biblioteca, escreva a função.

## Padrões que não se quebram

- **Autorização sempre no servidor.** `requireUser()` em page/layout, `requireUserAction()` +
  `assertCompanyAccess` / `assertCanManage` em server action. Esconder item de menu no front é UX,
  nunca segurança.
- **O papel define o teto, o acesso por empresa define o alcance.**
- **Rotinas é de quem a rotina alcança.** A seção aparece para quem tem rotina ativa atribuída, e
  para quem gerencia — não para todo colaborador. Papel não resolve isso: quem tem régua de pontos
  é colaborador igual a quem tem régua de rotina, e a diferença não está em `role`.
- **Todo cálculo de data é em BRT** (`America/Sao_Paulo`), nunca UTC. Misturar fuso desloca o
  fechamento da semana.
- **`kind` do estágio é o que o sistema calcula**, não o nome. Nome é livre e será customizável por
  empresa na V2.
- **Cor codifica camada:** neutro para trabalho, petróleo para ação/foco/progresso, semânticas só
  para estado, âmbar (`--reward`) só para coins/ranking/meta batida.
- **Borda antes de sombra.** Sombra só em camada flutuante.
- **Gamificação nunca por volume.** Coins vêm de percentual de meta e posição, com teto semanal.
  Toda regra nova passa pelo teste: *"como eu burlaria isso em cinco minutos?"*
- **Notificação só se muda o que a pessoa vai fazer nos próximos minutos.**

## Comandos

```bash
npm run dev        # http://localhost:3010 (via preview mkt-hub)
npm run typecheck
npm run test       # funcoes puras do revisor (veredito, camadas, copy)
npm run db:push    # aplica o schema no Supabase (usa DIRECT_URL, porta 5432)
npm run seed       # organização, 4 empresas, pipelines e o primeiro admin
npm run mail:teste -- --so-verificar   # autentica no SMTP sem mandar nada
```

`.env.local` precisa de `DATABASE_URL` (pooler 6543), `DIRECT_URL` (pooler 5432) e
`SESSION_SECRET` (32+ caracteres). Para anexos, `SUPABASE_URL` e `SUPABASE_SERVICE_KEY`.
Para o revisor, `CRON_SECRET` e a chave do provedor. Sem chave ele falha explicitamente, que é o
comportamento certo: **falha técnica nunca vira veredito**.

| Variável | Para quê |
|---|---|
| `REVIEW_PROVIDER` | `anthropic` ou `gemini`. Sem ela, vale a chave que existir |
| `ANTHROPIC_API_KEY` · `REVIEW_MODEL` | chave e modelo da Anthropic (padrão `claude-sonnet-5`) |
| `GEMINI_API_KEY` · `GEMINI_MODEL` | chave e modelo do Google (padrão `gemini-3.6-flash`) |
| `ANTHROPIC_BASE_URL` · `GEMINI_BASE_URL` | trocar a base: gateway, proxy ou servidor de teste |
| `REVIEW_READ_FILES=1` | religa a leitura de imagem e PDF, guardada desligada |
| `SMTP_HOST` · `SMTP_PORT` · `SMTP_USER` · `SMTP_PASSWORD` | envio de convite. Ver a nota de domínio abaixo |
| `MAIL_FROM` | remetente. Vazio usa o `SMTP_USER` |
| `APP_URL` | endereço público, para montar link que sai por e-mail |

Trocar de provedor é variável de ambiente e mais nada: o porteiro, o julgamento, o veredito e as
telas não sabem quem respondeu. A tela **Revisor → Regras** mostra quem está atendendo e avisa
quando falta a chave.

**O `.env.local` aponta para o banco de desenvolvimento** (`mkt-hub-dev`, ref `hqohquknxgiywpokmndp`),
nunca para produção — as variáveis de produção vivem na Vercel e não passam por este arquivo.
Antes de rodar seed em qualquer banco, `npm run dev:setup`: ele mostra o host, conta as linhas e
para sozinho se achar dado dentro.

## Deploy

Vercel (`mkt-hub`), produção em https://www.mkthub.space, conectada ao GitHub.
Push em `main` dispara build de produção.

**Domínio próprio desde 31/08/2026.** `mkthub.space` redireciona (308) para `www.mkthub.space`, e
os endereços antigos (`mkt-hub-wheat.vercel.app`, `mkt-hub-beatrizaraujows-projects.vercel.app`)
continuam apontando para o mesmo deploy — convite emitido antes da troca não morreu. O cookie de
sessão é *host-only*: quem estava logado pelo endereço antigo entra de novo no novo, uma vez.
`APP_URL` na Vercel guarda o endereço que sai por e-mail; trocar essa variável **só vale no próximo
deploy**.

**A autoria do commit precisa bater com uma conta do GitHub.** A Vercel bloqueia o deploy com
*"could not associate the committer with a GitHub user"* — e o deploy fica em BLOCKED sem log de
build, o que parece travamento. O repositório já está configurado com o e-mail noreply da conta.
Não troque `user.email` local por um e-mail que o GitHub não reconheça.

**Cron mais frequente que diário faz a Vercel recusar o deploy inteiro** no plano Hobby, antes de
criá-lo — sem build, sem log, sem nada em `vercel ls`. O `vercel.json` roda uma vez por dia por
isso, não por escolha de produto.

**Migration não roda no build.** Mudança de schema exige `npm run db:migrate` contra produção
antes do push, senão o código novo encontra o banco velho.

Quando um deploy não conclui, o estado real vem da API, não do `vercel ls`:

```bash
curl -s "https://api.vercel.com/v6/deployments?projectId=<id>&limit=3&teamId=<team>" \
  -H "Authorization: Bearer <token>"
```

Falta configurar as variáveis de ambiente do escopo **Preview** — o CLI não aceita adicioná-las
sem prompt. Production e Development estão prontos.

## Onde as coisas moram

- `src/db/schema.ts` — modelo de dados inteiro, comentado
- `src/lib/auth.ts` — sessão atual e autorização
- `src/lib/session.ts` — JWT de 12h em cookie httpOnly
- `src/proxy.ts` — checagem otimista de cookie (a real é `requireUser`)
- `src/components/nav-config.ts` — os 8 itens de navegação; `soon: true` marca o que não existe ainda
- `src/app/(app)/` — aplicação autenticada · `src/app/(auth)/` — login

## Pessoas

O time foi cadastrado em 25/08/2026, por convite: Maria Clara (admin master), Samuel, Maria Luiza,
Zion, Klenio e Thiago (colaboradores, com as quatro empresas). Anny é admin.

**A conta nasce sem senha e quem convida nunca escolhe a senha de ninguém.** Se precisar de mais
alguém, use a tela de Time ou `npm run invite`. Papel é o teto no sistema e não se infere do cargo
nem do que a pessoa costuma fazer no board — pergunte.

O convite sai por e-mail (SMTP) e **o link continua aparecendo na tela mesmo quando o envio
dá certo** — mensagem cai em spam, e enquanto o link estiver à mão isso não impede ninguém de
entrar. Falha de SMTP nunca cancela o convite: ela vira aviso, e o link vale igual.

**Convite para quem já tem senha é recusado.** Não substitui a senha vigente, só abre uma segunda
porta para a mesma conta — e agora essa porta ficaria numa caixa de entrada, encaminhável. Quem
esqueceu a senha troca a dela em Ajustes.

**A casa tem dois provedores de e-mail, um por domínio** — confira o MX antes de supor:
`@grupoquatro5.com` está no **Google Workspace** (`smtp.gmail.com`) e `@seubone.com` está no
**Zoho** (`smtp.zoho.com`). Autenticar um endereço no servidor do outro dá 535, porque a conta não
existe lá; e se passasse, o SPF do domínio não autoriza aquele remetente e a mensagem cai em spam.

`teste@mkthub.test` é conta de teste com poder de admin e senha conhecida. Desativar quando não
precisar mais.

## Estado atual

Em [docs/03-estado-do-projeto.md](docs/03-estado-do-projeto.md) — o que funciona, as pendências
e as armadilhas que já custaram tempo. Atualize esse arquivo quando um módulo ficar pronto.
