CREATE TABLE "webmail_domain" (
	"domain" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
-- The event export Job (db/export-events.ts) also copies new accounts per
-- UTC day and organisation into BigQuery. It reads them through this view,
-- which runs with the migrator's rights, its owner's, so
-- `website_export_reader` gets SELECT on the view alone and no email
-- address or user id leaves Postgres. An organisation is the lower-cased
-- domain after the last `@` once that domain holds at least 3 accounts in
-- all, `Personal email` for a domain in `webmail_domain`, and
-- `Other organisations` for every other domain. The view holds every UTC
-- day from the first account's through yesterday's, so each day it holds
-- is complete, and a day without new accounts is one row with a NULL
-- organisation and 0 accounts. `created_at` is a timestamp without time
-- zone holding UTC, the time zone of the service and of Cloud SQL, so its
-- date is the UTC day. Today is taken in UTC too, whatever the session's
-- time zone. db/migrate.ts fills `webmail_domain` after the migrations,
-- so a run whose fill fails leaves it empty. While it is empty the view
-- holds no rows, and the export fails with the BigQuery table kept,
-- so webmail domains never show by name.
CREATE VIEW "account_daily" AS
WITH account AS (
	SELECT "created_at"::date AS day, lower(substring("email" FROM '[^@]*$')) AS domain
	FROM "user"
),
labelled AS (
	SELECT day,
		CASE
			WHEN domain IN (SELECT "domain" FROM "webmail_domain") THEN 'Personal email'
			WHEN count(*) OVER (PARTITION BY domain) >= 3 THEN domain
			ELSE 'Other organisations'
		END AS organisation
	FROM account
),
counted AS (
	SELECT day, organisation, count(*)::int AS accounts
	FROM labelled
	GROUP BY day, organisation
),
days AS (
	SELECT generate_series(min(day), (now() AT TIME ZONE 'UTC')::date - 1, interval '1 day')::date AS day
	FROM account
	WHERE EXISTS (SELECT 1 FROM "webmail_domain")
)
SELECT days.day, counted.organisation, coalesce(counted.accounts, 0) AS accounts
FROM days
LEFT JOIN counted USING (day);
--> statement-breakpoint
GRANT SELECT ON "account_daily" TO website_export_reader;
