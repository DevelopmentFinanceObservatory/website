CREATE TABLE "event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"user_id" text,
	"visitor_id" text,
	"page" text,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "event_created_at_idx" ON "event" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "event_name_created_at_idx" ON "event" USING btree ("name","created_at" DESC NULLS LAST);