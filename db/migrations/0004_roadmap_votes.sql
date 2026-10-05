CREATE TABLE "roadmap_vote" (
	"user_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roadmap_vote_user_id_entry_id_pk" PRIMARY KEY("user_id","entry_id")
);
--> statement-breakpoint
ALTER TABLE "roadmap_vote" ADD CONSTRAINT "roadmap_vote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roadmap_vote_entry_idx" ON "roadmap_vote" USING btree ("entry_id");