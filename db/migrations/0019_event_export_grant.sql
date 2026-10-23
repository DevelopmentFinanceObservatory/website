-- The event export Job (db/export-events.ts) reads `event` as its own IAM
-- database user, a member of the NOLOGIN role `website_export_reader`.
-- dfo-infra's website stack creates the role in every tier, with CONNECT on
-- the database and USAGE on schema public, so the name is literal here.
-- The role gets no other table.
GRANT SELECT ON "event" TO website_export_reader;
