-- Erases the publisher's text from every library_artifact row written with
-- withdrawn_at set, whichever release writes it. The deploy runs migrations
-- before the new image serves, so a release that sets withdrawn_at alone can
-- still withdraw after this migration. The trigger is BEFORE, so the erased
-- values are the ones stored, and it runs with the writer's rights, which
-- cover library_artifact_topic.
CREATE FUNCTION "library_artifact_erase_withdrawn"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW."title" := '';
  NEW."description" := '';
  NEW."content_title" := NULL;
  NEW."content" := NULL;
  NEW."sources" := '[]'::jsonb;
  NEW."steps" := '[]'::jsonb;
  DELETE FROM "library_artifact_topic" WHERE "artifact_id" = NEW."id";
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "library_artifact_erase_withdrawn"
BEFORE INSERT OR UPDATE ON "library_artifact"
FOR EACH ROW WHEN (NEW."withdrawn_at" IS NOT NULL)
EXECUTE FUNCTION "library_artifact_erase_withdrawn"();--> statement-breakpoint
-- Rows withdrawn before the trigger existed: rewriting withdrawn_at as it is
-- fires the trigger on each.
UPDATE "library_artifact" SET "withdrawn_at" = "withdrawn_at" WHERE "withdrawn_at" IS NOT NULL;
