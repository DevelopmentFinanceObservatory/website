CREATE TABLE "share_card_result" (
	"share_id" text NOT NULL,
	"card_id" text NOT NULL,
	"status" text,
	"card" jsonb,
	"frame" jsonb,
	"code" text,
	"retryable" boolean,
	"retry_after_s" integer,
	"checked_at" timestamp with time zone,
	"fresh_until" timestamp with time zone,
	"lease_until" timestamp with time zone,
	CONSTRAINT "share_card_result_share_id_card_id_pk" PRIMARY KEY("share_id","card_id")
);
--> statement-breakpoint
ALTER TABLE "share_card_result" ADD CONSTRAINT "share_card_result_share_id_share_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."share"("id") ON DELETE cascade ON UPDATE no action;