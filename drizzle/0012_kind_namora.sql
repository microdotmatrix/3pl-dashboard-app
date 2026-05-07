ALTER TABLE "monthly_billing_report" ADD COLUMN "previous_zoho_invoice_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_billing_report" ADD COLUMN "last_reverted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monthly_billing_report" ADD COLUMN "last_reverted_by" text;--> statement-breakpoint
ALTER TABLE "monthly_billing_report" ADD COLUMN "last_revert_reason" text;--> statement-breakpoint
ALTER TABLE "monthly_billing_report" ADD CONSTRAINT "monthly_billing_report_last_reverted_by_user_id_fk" FOREIGN KEY ("last_reverted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;