CREATE TABLE "share_ref" (
	"share_id" text NOT NULL,
	"part_index" integer NOT NULL,
	"spec_id" text NOT NULL,
	"identity" jsonb NOT NULL,
	"variable_text" text,
	"resolved_stat_var_dcids" jsonb,
	"content_version" text,
	CONSTRAINT "share_ref_share_id_part_index_pk" PRIMARY KEY("share_id","part_index")
);
--> statement-breakpoint
ALTER TABLE "share" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "share" ADD COLUMN "mode" text;--> statement-breakpoint
ALTER TABLE "share_ref" ADD CONSTRAINT "share_ref_share_id_share_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."share"("id") ON DELETE cascade ON UPDATE no action;