CREATE TABLE "monthly_billing_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sheet_source_hash" text NOT NULL,
	"shipment_count" integer DEFAULT 0 NOT NULL,
	"package_count" integer DEFAULT 0 NOT NULL,
	"packaging_cost_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"unmatched_shipment_count" integer DEFAULT 0 NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "monthly_billing_report_shipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"shipment_id" uuid,
	"external_id" text NOT NULL,
	"ship_date" timestamp with time zone,
	"status" text NOT NULL,
	"package_count" integer DEFAULT 0 NOT NULL,
	"packaging_cost_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"match_status" text NOT NULL,
	"package_matches" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monthly_billing_report" ADD CONSTRAINT "monthly_billing_report_account_id_shipstation_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."shipstation_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_billing_report_shipment" ADD CONSTRAINT "monthly_billing_report_shipment_report_id_monthly_billing_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."monthly_billing_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_billing_report_shipment" ADD CONSTRAINT "monthly_billing_report_shipment_shipment_id_shipstation_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipstation_shipment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_billing_report_account_period_idx" ON "monthly_billing_report" USING btree ("account_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "monthly_billing_report_status_idx" ON "monthly_billing_report" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_billing_report_shipment_report_external_idx" ON "monthly_billing_report_shipment" USING btree ("report_id","external_id");--> statement-breakpoint
CREATE INDEX "monthly_billing_report_shipment_report_idx" ON "monthly_billing_report_shipment" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "monthly_billing_report_shipment_match_idx" ON "monthly_billing_report_shipment" USING btree ("match_status");