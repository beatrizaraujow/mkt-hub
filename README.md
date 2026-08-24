# MKT Hub

Sistema de gestão do time de marketing do Grupo SB — SeuBoné, Onevo, Carbone Educação e Weevo.

Substitui o ClickUp e, depois, absorve o MKT Hub atual (`mktimer`).

> **Máxima clareza com o mínimo de complexidade.**

## Documentação

- [Análise, arquitetura e MVP](docs/01-analise-e-arquitetura.md) — o porquê de cada decisão
- [O board que vamos substituir](docs/02-clickup-house-quatro5.md) — levantamento do ClickUp House Quatro5
- [Estado do projeto](docs/03-estado-do-projeto.md) — onde está, o que falta, armadilhas conhecidas
- [CLAUDE.md](CLAUDE.md) — regras de engenharia do projeto

## Stack

Next.js 16 · TypeScript · Tailwind v4 · Drizzle · PostgreSQL (Supabase) · Vercel

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencher DATABASE_URL, DIRECT_URL e SESSION_SECRET
npm run db:migrate
npm run seed
npm run dev
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run typecheck` | TypeScript sem emitir |
| `npm run db:generate` | Gera migration a partir do schema |
| `npm run db:migrate` | Aplica migrations pendentes |
| `npm run seed` | Organização, empresas, pipelines e primeiro admin |

## Estado

| Módulo | Situação |
|---|---|
| Autenticação, papéis e acesso por empresa | Pronto |
| Empresas e projetos | Pronto |
| Tarefas, quadro e cronômetro | Em construção |
| Rotinas, metas, coins e ranking | V1.5 |
| Produção de conteúdo e captações | V2 |
