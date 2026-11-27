DELETE FROM "library_artifact_topic" WHERE "artifact_id" IN (SELECT "id" FROM "library_artifact" WHERE "withdrawn_at" IS NOT NULL);--> statement-breakpoint
UPDATE "library_artifact" SET "title" = '', "description" = '', "content_title" = NULL, "content" = NULL, "sources" = '[]'::jsonb, "steps" = '[]'::jsonb WHERE "withdrawn_at" IS NOT NULL;
