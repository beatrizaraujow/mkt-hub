CREATE TYPE "public"."snapshot_status" AS ENUM('pendente', 'fechado');--> statement-breakpoint
CREATE TABLE "snapshot_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"job_title" text,
	"rule" "performance_rule" NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"deliveries" integer DEFAULT 0 NOT NULL,
	"without_points" integer DEFAULT 0 NOT NULL,
	"routines_done" integer DEFAULT 0 NOT NULL,
	"routines_due" integer DEFAULT 0 NOT NULL,
	"weekly_target" integer,
	"weekly_target_120" integer,
	"percent" integer,
	"position" integer,
	"coins_suggested" smallint DEFAULT 0 NOT NULL,
	"coins_validated" smallint,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "week_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"week_id" text NOT NULL,
	"week_start" date NOT NULL,
	"week_end" date NOT NULL,
	"status" "snapshot_status" DEFAULT 'pendente' NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by_id" uuid,
	"edits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "snapshot_entries" ADD CONSTRAINT "snapshot_entries_snapshot_id_week_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."week_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_entries" ADD CONSTRAINT "snapshot_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_snapshots" ADD CONSTRAINT "week_snapshots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_snapshots" ADD CONSTRAINT "week_snapshots_closed_by_id_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_entry_unique" ON "snapshot_entries" USING btree ("snapshot_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_org_week_unique" ON "week_snapshots" USING btree ("org_id","week_id");