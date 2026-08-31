-- O numero curto da tarefa: o que vira `mkt-123` no link e na conversa.
--
-- Escrita a mao porque a versao gerada fazia so duas coisas: adicionar a coluna
-- com `DEFAULT nextval(...)` e criar o indice. Faltavam as duas que importam —
-- criar a sequencia (sem ela o DEFAULT quebra na primeira linha) e numerar o
-- que ja existe em ordem de criacao, para a tarefa mais antiga ser a mkt-1.
CREATE SEQUENCE IF NOT EXISTS work_item_number_seq;--> statement-breakpoint

ALTER TABLE "work_items" ADD COLUMN "number" integer;--> statement-breakpoint

-- Ordem de criacao, com o id como desempate: duas tarefas criadas no mesmo
-- milissegundo (import do ClickUp faz isso) precisam de uma ordem estavel,
-- senao rodar de novo daria numeros diferentes.
UPDATE "work_items" AS w
SET "number" = o.n
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM "work_items"
) AS o
WHERE w.id = o.id;--> statement-breakpoint

-- A sequencia continua de onde a numeracao parou. `true` no terceiro argumento
-- faz o proximo `nextval` devolver max+1, e nao max.
SELECT setval('work_item_number_seq', COALESCE((SELECT max("number") FROM "work_items"), 0), true);--> statement-breakpoint

ALTER TABLE "work_items" ALTER COLUMN "number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "work_items" ALTER COLUMN "number" SET DEFAULT nextval('work_item_number_seq');--> statement-breakpoint

CREATE UNIQUE INDEX "wi_org_number_unique" ON "work_items" USING btree ("org_id","number");
