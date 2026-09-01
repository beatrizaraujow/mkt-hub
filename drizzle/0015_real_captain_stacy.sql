ALTER TABLE "review_checklist_items" ADD COLUMN "depends_on_report" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "review_exempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "review_exempt_reason" text;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "review_exempt_note" text;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "review_exempt_kind" text;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "review_exempt_by_id" uuid;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "review_exempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "review_exempt_cosigned_by_id" uuid;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "review_exempt_cosigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_review_exempt_by_id_users_id_fk" FOREIGN KEY ("review_exempt_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_review_exempt_cosigned_by_id_users_id_fk" FOREIGN KEY ("review_exempt_cosigned_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wi_exempt_idx" ON "work_items" USING btree ("org_id","review_exempt");