CREATE TABLE "day_salt" (
	"day" date PRIMARY KEY NOT NULL,
	"salt" "bytea" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "day_visitor" text;