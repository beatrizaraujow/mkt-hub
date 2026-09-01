ALTER TABLE "review_checklist_items" ADD COLUMN "format" text;--> statement-breakpoint
ALTER TABLE "review_checklist_items" ADD COLUMN "momento" text DEFAULT 'operacional' NOT NULL;--> statement-breakpoint
ALTER TABLE "review_checklist_items" ADD COLUMN "only_after_rework" boolean DEFAULT false NOT NULL;