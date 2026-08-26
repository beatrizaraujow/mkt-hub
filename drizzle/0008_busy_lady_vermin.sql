CREATE TYPE "public"."review_human_verdict" AS ENUM('concordou', 'discordou');--> statement-breakpoint
CREATE TABLE "review_checklist_answers" (
	"work_item_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"answered_by_id" uuid,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_checklist_answers_work_item_id_item_id_pk" PRIMARY KEY("work_item_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "review_cycles" ADD COLUMN "language_notes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD COLUMN "input_hash" text;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD COLUMN "reused_from_id" uuid;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD COLUMN "escalated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD COLUMN "human_verdict" "review_human_verdict";--> statement-breakpoint
ALTER TABLE "review_cycles" ADD COLUMN "human_decided_by_id" uuid;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD COLUMN "human_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_rules" ADD COLUMN "overrides_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "review_rules" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "copy" text;--> statement-breakpoint
ALTER TABLE "review_checklist_answers" ADD CONSTRAINT "review_checklist_answers_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_checklist_answers" ADD CONSTRAINT "review_checklist_answers_item_id_review_checklist_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."review_checklist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_checklist_answers" ADD CONSTRAINT "review_checklist_answers_answered_by_id_users_id_fk" FOREIGN KEY ("answered_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_reused_from_id_review_cycles_id_fk" FOREIGN KEY ("reused_from_id") REFERENCES "public"."review_cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_human_decided_by_id_users_id_fk" FOREIGN KEY ("human_decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_rules" ADD CONSTRAINT "review_rules_overrides_rule_id_review_rules_id_fk" FOREIGN KEY ("overrides_rule_id") REFERENCES "public"."review_rules"("id") ON DELETE set null ON UPDATE no action;