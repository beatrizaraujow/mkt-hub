-- Pipeline de tarefa: 11 etapas, com slug estável.
--
-- A ordem aqui importa. O índice único de slug só pode nascer DEPOIS do
-- preenchimento: criado antes, todas as linhas teriam slug vazio e colidiriam
-- entre si dentro do mesmo pipeline.
--
-- Nenhum item fica órfão. As etapas são linhas e os itens apontam para elas
-- por id; renomear "Concluído" para "Completo" mexe no texto de uma linha, não
-- no vínculo. As cinco etapas novas nascem vazias.
--
-- Idempotente do começo ao fim: rodar duas vezes não duplica nada.

ALTER TABLE "work_item_stages" ADD COLUMN IF NOT EXISTS "slug" text DEFAULT '' NOT NULL;
--> statement-breakpoint

-- Slug das etapas que já existiam, pelo nome semeado.
UPDATE "work_item_stages" SET "slug" = CASE
  WHEN "type" = 'task' AND "name" = 'Solicitado'   THEN 'solicitado'
  WHEN "type" = 'task' AND "name" = 'Pendente'     THEN 'pendente'
  WHEN "type" = 'task' AND "name" = 'Em andamento' THEN 'em_andamento'
  WHEN "type" = 'task' AND "name" = 'Ajustar'      THEN 'ajustar'
  WHEN "type" = 'task' AND "name" = 'Aprovação'    THEN 'aprovacao'
  WHEN "type" = 'task' AND "name" IN ('Concluído', 'Completo') THEN 'completo'
  WHEN "type" = 'content' AND "name" = 'Briefing'  THEN 'briefing'
  WHEN "type" = 'content' AND "name" = 'Roteiro'   THEN 'roteiro'
  WHEN "type" = 'content' AND "name" = 'Gravação'  THEN 'gravacao'
  WHEN "type" = 'content' AND "name" = 'Edição'    THEN 'edicao'
  WHEN "type" = 'content' AND "name" = 'Aprovação' THEN 'aprovacao'
  WHEN "type" = 'content' AND "name" = 'Publicado' THEN 'publicado'
  WHEN "type" = 'capture' AND "name" = 'Solicitado' THEN 'solicitado'
  WHEN "type" = 'capture' AND "name" = 'Agendado'   THEN 'agendado'
  WHEN "type" = 'capture' AND "name" = 'Captado'    THEN 'captado'
  WHEN "type" = 'capture' AND "name" = 'Enviado'    THEN 'enviado'
  WHEN "type" = 'capture' AND "name" = 'Finalizado' THEN 'finalizado'
  ELSE "slug"
END
WHERE "slug" = '';
--> statement-breakpoint

-- Concluído vira Completo. Mesma linha, mesmo id, mesmos itens apontando.
UPDATE "work_item_stages" SET "name" = 'Completo'
WHERE "type" = 'task' AND "slug" = 'completo' AND "name" <> 'Completo';
--> statement-breakpoint

-- Abre espaço na numeração para as etapas novas.
UPDATE "work_item_stages" SET "position" = CASE "slug"
  WHEN 'solicitado'   THEN 10
  WHEN 'pendente'     THEN 20
  WHEN 'em_andamento' THEN 30
  WHEN 'ajustar'      THEN 60
  WHEN 'aprovacao'    THEN 70
  WHEN 'completo'     THEN 100
  ELSE "position"
END
WHERE "type" = 'task';
--> statement-breakpoint

-- As cinco novas, uma vez por organização, só onde ainda não existem.
INSERT INTO "work_item_stages" ("org_id", "company_id", "type", "name", "slug", "kind", "position")
SELECT o."id", NULL, 'task', novas."name", novas."slug", novas."kind"::"public"."stage_kind", novas."position"
FROM "organizations" o
CROSS JOIN (VALUES
  ('Pré revisão',        'pre_revisao',      'review', 40),
  ('Revisão IA',         'revisao_ia',       'review', 50),
  ('Aprovação líder',    'aprovacao_lider',  'review', 80),
  ('Publicar',           'publicar',         'doing',  90),
  ('Banco de criativos', 'banco_criativos',  'done',   110)
) AS novas("name", "slug", "kind", "position")
WHERE NOT EXISTS (
  SELECT 1 FROM "work_item_stages" s
  WHERE s."org_id" = o."id"
    AND s."type" = 'task'
    AND s."company_id" IS NULL
    AND s."slug" = novas."slug"
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "stages_default_slug_unique"
  ON "work_item_stages" USING btree ("org_id", "type", "slug")
  WHERE "work_item_stages"."company_id" is null;
