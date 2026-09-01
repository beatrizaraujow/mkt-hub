ALTER TABLE "work_items" ADD COLUMN "review_exempt_requested_by_id" uuid;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "review_exempt_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "review_exempt_denied_by_id" uuid;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "review_exempt_denied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "review_exempt_denied_reason" text;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_review_exempt_requested_by_id_users_id_fk" FOREIGN KEY ("review_exempt_requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_review_exempt_denied_by_id_users_id_fk" FOREIGN KEY ("review_exempt_denied_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;