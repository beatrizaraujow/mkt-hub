CREATE TYPE "public"."performance_rule" AS ENUM('pontos', 'rotinas');--> statement-breakpoint
CREATE TABLE "performance_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rule" "performance_rule" DEFAULT 'pontos' NOT NULL,
	"weekly_target" integer,
	"weekly_target_120" integer,
	"coins_at_100" smallint DEFAULT 3 NOT NULL,
	"coins_at_120" smallint DEFAULT 5 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "performance_goals" ADD CONSTRAINT "performance_goals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_goals" ADD CONSTRAINT "performance_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "performance_goal_user_unique" ON "performance_goals" USING btree ("user_id");