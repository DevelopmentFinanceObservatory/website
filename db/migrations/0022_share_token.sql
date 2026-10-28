CREATE TABLE "share_token" (
	"share_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"write_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "share_token" ADD CONSTRAINT "share_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;