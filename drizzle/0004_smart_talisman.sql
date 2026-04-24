CREATE TABLE "whiteboard_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whiteboard_note_shipment" (
	"note_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	CONSTRAINT "whiteboard_note_shipment_note_id_shipment_id_pk" PRIMARY KEY("note_id","shipment_id")
);
--> statement-breakpoint
CREATE TABLE "whiteboard_note_vendor" (
	"note_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	CONSTRAINT "whiteboard_note_vendor_note_id_account_id_pk" PRIMARY KEY("note_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "whiteboard_read_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whiteboard_note" ADD CONSTRAINT "whiteboard_note_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard_note_shipment" ADD CONSTRAINT "whiteboard_note_shipment_note_id_whiteboard_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."whiteboard_note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard_note_shipment" ADD CONSTRAINT "whiteboard_note_shipment_shipment_id_shipstation_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipstation_shipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard_note_vendor" ADD CONSTRAINT "whiteboard_note_vendor_note_id_whiteboard_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."whiteboard_note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard_note_vendor" ADD CONSTRAINT "whiteboard_note_vendor_account_id_shipstation_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."shipstation_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard_read_state" ADD CONSTRAINT "whiteboard_read_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whiteboard_note_pinned_created_idx" ON "whiteboard_note" USING btree ("pinned","created_at");--> statement-breakpoint
CREATE INDEX "whiteboard_note_created_idx" ON "whiteboard_note" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "whiteboard_note_shipment_shipment_idx" ON "whiteboard_note_shipment" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "whiteboard_note_vendor_account_idx" ON "whiteboard_note_vendor" USING btree ("account_id");