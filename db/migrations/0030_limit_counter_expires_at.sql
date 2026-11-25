DROP INDEX "limit_counter_window_start_idx";--> statement-breakpoint
ALTER TABLE "limit_counter" ADD COLUMN "expires_at" timestamp with time zone DEFAULT now() + interval '2 days' NOT NULL;--> statement-breakpoint
CREATE INDEX "limit_counter_expires_at_idx" ON "limit_counter" USING btree ("expires_at");