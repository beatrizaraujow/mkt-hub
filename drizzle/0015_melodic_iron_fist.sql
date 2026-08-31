-- O numero curto da tarefa: o que vira `mkt-123` no link e na conversa.
--
-- Escrita a mao porque a versao gerada fazia so duas coisas: adicionar a coluna
-- com `DEFAULT nextval(...)` e criar o indice. Faltavam as duas que importam —
-- criar a sequencia (sem ela o DEFAULT quebra na primeira linha) e numerar o
-- que ja existe em ordem de criacao, para a tarefa mais antiga ser a mkt-1.
--
-- **Toda linha aqui e re-executavel.** Se ela falhar no meio, o drizzle nao
-- registra nada em `__drizzle_migrations` e a proxima tentativa comeca do topo;
-- sem os `IF NOT EXISTS`, essa segunda tentativa morreria no `ADD COLUMN` de
-- uma coluna que ja existe, e o conserto viraria trabalho manual em producao.
-- O `UPDATE` tambem repete sem estrago: a ordem e deterministica, entao rodar
-- duas vezes escreve exatamente os mesmos numeros.
CREATE SEQUENCE IF NOT EXISTS work_item_number_seq;--> statement-breakpoint

ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "number" integer;--> statement-breakpoint

-- Ordem de criacao, com o id como desempate: duas tarefas criadas no mesmo
-- milissegundo (import do ClickUp faz isso) precisam de uma ordem estavel,
-- senao rodar de novo daria numeros diferentes.
--
-- `where number is null` protege o caso de a migration ter passado daqui numa
-- tentativa anterior: linha ja numerada nao e renumerada, e nenhum link que ja
-- circulou muda de dono.
UPDATE "work_items" AS w
SET "number" = o.n
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM "work_items"
) AS o
WHERE w.id = o.id AND w."number" IS NULL;--> statement-breakpoint

-- A sequencia continua de onde a numeracao parou.
--
-- `max + 1` com `is_called = false`, e nao `max` com `true`. Os dois dao o
-- mesmo proximo numero quando existe linha, mas numa tabela **vazia** o
-- segundo vira `setval(seq, 0, true)` — e zero fica abaixo do `MINVALUE 1`
-- padrao da sequencia, entao o Postgres recusa e a migration morre ali. Nao
-- apareceu em desenvolvimento porque havia 85 linhas; apareceria no primeiro
-- banco novo que alguem migrasse do zero.
SELECT setval('work_item_number_seq', COALESCE((SELECT max("number") FROM "work_items"), 0) + 1, false);--> statement-breakpoint

ALTER TABLE "work_items" ALTER COLUMN "number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "work_items" ALTER COLUMN "number" SET DEFAULT nextval('work_item_number_seq');--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "wi_org_number_unique" ON "work_items" USING btree ("org_id","number");
