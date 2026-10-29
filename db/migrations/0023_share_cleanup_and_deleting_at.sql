CREATE TABLE "share_cleanup" (
	"share_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"write_token" text NOT NULL,
	"reason" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "deleting_at" timestamp with time zone;