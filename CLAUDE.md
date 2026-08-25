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
npm run db:push    # aplica o schema no Supabase (usa DIRECT_URL, porta 5432)
npm run seed       # organização, 4 empresas, pipelines e o primeiro admin
```

`.env.local` precisa de `DATABASE_URL` (pooler 6543), `DIRECT_URL` (pooler 5432) e
`SESSION_SECRET` (32+ caracteres). Para anexos, `SUPABASE_URL` e `SUPABASE_SERVICE_KEY`.
Para o revisor, `CRON_SECRET` e `ANTHROPIC_API_KEY` — sem a chave do modelo ele falha
explicitamente, que é o comportamento certo: **falha técnica nunca vira veredito**.
`REVIEW_MODEL` troca o modelo sem mexer em código.

**O `.env.local` aponta para o banco de desenvolvimento** (`mkt-hub-dev`, ref `hqohquknxgiywpokmndp`),
nunca para produção — as variáveis de produção vivem na Vercel e não passam por este arquivo.
Antes de rodar seed em qualquer banco, `npm run dev:setup`: ele mostra o host, conta as linhas e
para sozinho se achar dado dentro.

## Deploy

Vercel (`mkt-hub`), produção em https://mkt-hub-wheat.vercel.app, conectada ao GitHub.
Push em `main` dispara build de produção.

**A autoria do commit precisa bater com uma conta do GitHub.** A Vercel bloqueia o deploy com
*"could not associate the committer with a GitHub user"* — e o deploy fica em BLOCKED sem log de
build, o que parece travamento. O repositório já está configurado com o e-mail noreply da conta.
Não troque `user.email` local por um e-mail que o GitHub não reconheça.

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

`teste@mkthub.test` é conta de teste com poder de admin e senha conhecida. Desativar quando não
precisar mais.

## Estado atual

Em [docs/03-estado-do-projeto.md](docs/03-estado-do-projeto.md) — o que funciona, as pendências
e as armadilhas que já custaram tempo. Atualize esse arquivo quando um módulo ficar pronto.
