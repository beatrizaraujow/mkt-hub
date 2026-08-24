ALTER TABLE "attachments" ALTER COLUMN "mime_type" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "size_bytes" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "storage_key" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "kind" "attachment_kind" DEFAULT 'file' NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "url" text;