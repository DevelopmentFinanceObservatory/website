CREATE TABLE IF NOT EXISTS "feedback" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "feedback_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"message" text NOT NULL,
	"email" text,
	"page" text,
	"user_agent" text,
	CONSTRAINT "feedback_message_length" CHECK (char_length("feedback"."message") BETWEEN 1 AND 5000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_created_at_idx" ON "feedback" USING btree ("created_at" DESC NULLS LAST);