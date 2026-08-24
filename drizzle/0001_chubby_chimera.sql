ALTER TABLE "companies" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "points" integer;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "skill" text;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "format" text;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "is_asset" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "requester_name" text;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "requester_email" text;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "requester_phone" text;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_parent_id_companies_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_parent_idx" ON "companies" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "wi_asset_idx" ON "work_items" USING btree ("org_id","is_asset");