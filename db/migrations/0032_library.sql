CREATE TABLE "library_artifact" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"share_id" text NOT NULL,
	"kind" text NOT NULL,
	"mode" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"content_title" text,
	"content" text,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_artifact_kind" CHECK ("library_artifact"."kind" IN ('chart', 'canvas', 'data')),
	CONSTRAINT "library_artifact_mode" CHECK ("library_artifact"."mode" IN ('live', 'snapshot'))
);
--> statement-breakpoint
CREATE TABLE "library_artifact_topic" (
	"artifact_id" text NOT NULL,
	"topic_id" text NOT NULL,
	CONSTRAINT "library_artifact_topic_artifact_id_topic_id_pk" PRIMARY KEY("artifact_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "library_topic" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library_artifact" ADD CONSTRAINT "library_artifact_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_artifact_topic" ADD CONSTRAINT "library_artifact_topic_artifact_id_library_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."library_artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_artifact_topic" ADD CONSTRAINT "library_artifact_topic_topic_id_library_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."library_topic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "library_artifact_slug_idx" ON "library_artifact" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "library_artifact_published_at_idx" ON "library_artifact" USING btree ("published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "library_artifact_topic_topic_idx" ON "library_artifact_topic" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_topic_label_idx" ON "library_topic" USING btree ("label");