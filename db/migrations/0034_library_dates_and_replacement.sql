ALTER TABLE "library_artifact" ADD COLUMN "card_dates" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "library_artifact" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "library_artifact" ADD COLUMN "replaced_by" text;--> statement-breakpoint
ALTER TABLE "library_artifact" ADD CONSTRAINT "library_artifact_replaced_by_library_artifact_id_fk" FOREIGN KEY ("replaced_by") REFERENCES "public"."library_artifact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_artifact" ADD CONSTRAINT "library_artifact_replaced_by_withdrawn" CHECK ("library_artifact"."replaced_by" IS NULL OR "library_artifact"."withdrawn_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "library_artifact" ADD CONSTRAINT "library_artifact_replaced_by_other" CHECK ("library_artifact"."replaced_by" IS NULL OR "library_artifact"."replaced_by" <> "library_artifact"."id");