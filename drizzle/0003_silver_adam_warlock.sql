DROP TABLE IF EXISTS "shipments";
--> statement-breakpoint
CREATE TABLE "shipstation_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipstation_account_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "shipstation_shipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"external_shipment_id" text,
	"status" text NOT NULL,
	"carrier_id" text,
	"service_code" text,
	"ship_date" timestamp with time zone,
	"created_at_remote" timestamp with time zone NOT NULL,
	"modified_at_remote" timestamp with time zone NOT NULL,
	"ship_to" jsonb,
	"ship_from" jsonb,
	"warehouse_id" text,
	"tags" jsonb,
	"total_weight" jsonb,
	"package_count" integer,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipstation_sync_cursor" (
	"account_id" uuid NOT NULL,
	"resource" text NOT NULL,
	"last_modified_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_status" text,
	"last_error" text,
	CONSTRAINT "shipstation_sync_cursor_account_id_resource_pk" PRIMARY KEY("account_id","resource")
);
--> statement-breakpoint
ALTER TABLE "shipstation_shipment" ADD CONSTRAINT "shipstation_shipment_account_id_shipstation_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."shipstation_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipstation_sync_cursor" ADD CONSTRAINT "shipstation_sync_cursor_account_id_shipstation_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."shipstation_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipstation_shipment_account_external_idx" ON "shipstation_shipment" USING btree ("account_id","external_id");--> statement-breakpoint
CREATE INDEX "shipstation_shipment_account_status_idx" ON "shipstation_shipment" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX "shipstation_shipment_modified_at_idx" ON "shipstation_shipment" USING btree ("modified_at_remote");
--> statement-breakpoint
INSERT INTO "shipstation_account" ("slug", "display_name")
VALUES ('dip', 'DIP')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "shipstation_account" ("slug", "display_name")
VALUES ('fatass', 'FATASS')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "shipstation_account" ("slug", "display_name")
VALUES ('ryot', 'RYOT')
ON CONFLICT ("slug") DO NOTHING;
