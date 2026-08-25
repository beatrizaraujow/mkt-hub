CREATE TYPE "public"."review_cycle_status" AS ENUM('pendente', 'rodando', 'emitido', 'incompleto', 'falhou');--> statement-breakpoint
CREATE TYPE "public"."review_verdict" AS ENUM('aprovado', 'ajustar', 'reprovado');--> statement-breakpoint
CREATE TYPE "public"."rule_verifier" AS ENUM('maquina', 'pessoa', 'fora');--> statement-breakpoint
CREATE TYPE "public"."review_run_state" AS ENUM('na_fila', 'rodando', 'concluida', 'falhou');--> statement-breakpoint
CREATE TABLE "review_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"company_id" uuid,
	"skill" text,
	"text" text NOT NULL,
	"rule_id" uuid,
	"is_reliability_probe" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" double precision DEFAULT 1000 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"status" "review_cycle_status" DEFAULT 'pendente' NOT NULL,
	"verdict" "review_verdict",
	"gate_missing" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_silent" boolean DEFAULT true NOT NULL,
	"requested_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "review_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"rule_id" uuid,
	"rule_code" text NOT NULL,
	"rule_text" text NOT NULL,
	"detail" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_blocking" boolean DEFAULT false NOT NULL,
	"attachment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"company_id" uuid,
	"skill" text,
	"format" text,
	"code" text NOT NULL,
	"text" text NOT NULL,
	"rationale" text,
	"verifier" "rule_verifier" NOT NULL,
	"is_blocking" boolean DEFAULT false NOT NULL,
	"machine_hint" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" double precision DEFAULT 1000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"state" "review_run_state" DEFAULT 'na_fila' NOT NULL,
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"error" text,
	"claimed_at" timestamp with time zone,
	"claim_expires_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_settings" (
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_settings_org_id_key_pk" PRIMARY KEY("org_id","key")
);
--> statement-breakpoint
ALTER TABLE "review_checklist_items" ADD CONSTRAINT "review_checklist_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_checklist_items" ADD CONSTRAINT "review_checklist_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_checklist_items" ADD CONSTRAINT "review_checklist_items_rule_id_review_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."review_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_cycle_id_review_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."review_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_rule_id_review_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."review_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_findings" ADD CONSTRAINT "review_findings_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_rules" ADD CONSTRAINT "review_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_rules" ADD CONSTRAINT "review_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_runs" ADD CONSTRAINT "review_runs_cycle_id_review_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."review_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_settings" ADD CONSTRAINT "review_settings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_checklist_scope_idx" ON "review_checklist_items" USING btree ("org_id","company_id","skill");--> statement-breakpoint
CREATE UNIQUE INDEX "review_cycles_item_round_unique" ON "review_cycles" USING btree ("work_item_id","round");--> statement-breakpoint
CREATE INDEX "review_cycles_status_idx" ON "review_cycles" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "review_findings_cycle_idx" ON "review_findings" USING btree ("cycle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_rules_org_code_unique" ON "review_rules" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "review_rules_scope_idx" ON "review_rules" USING btree ("org_id","company_id","skill");--> statement-breakpoint
CREATE UNIQUE INDEX "review_runs_cycle_attempt_unique" ON "review_runs" USING btree ("cycle_id","attempt");--> statement-breakpoint
CREATE INDEX "review_runs_queue_idx" ON "review_runs" USING btree ("state","created_at");