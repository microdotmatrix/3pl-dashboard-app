ALTER TABLE "monthly_billing_report" ADD COLUMN "small_bin_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_billing_report" ADD COLUMN "medium_bin_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_billing_report" ADD COLUMN "large_bin_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_billing_report" ADD COLUMN "cartons_received_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_billing_report" ADD COLUMN "retail_returns_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_billing_report" ADD COLUMN "special_project_hours" numeric(12, 2) DEFAULT '0' NOT NULL;