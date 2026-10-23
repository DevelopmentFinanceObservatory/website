CREATE TABLE "limit_counter" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "limit_counter_window_start_idx" ON "limit_counter" USING btree ("window_start");