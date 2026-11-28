ALTER TABLE "library_artifact" ADD COLUMN "card_cites" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- The trigger from migration 0033 erases the new column with the rest of
-- the publisher's text. Rows withdrawn before this migration hold the
-- column's empty default.
CREATE OR REPLACE FUNCTION "library_artifact_erase_withdrawn"() RETURNS trigger
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
  NEW."card_cites" := '[]'::jsonb;
  DELETE FROM "library_artifact_topic" WHERE "artifact_id" = NEW."id";
  RETURN NEW;
END;
$$;
