-- One row per account the account export carries: the user id, the UTC day
-- the account was created, and its organisation under the `account_daily`
-- rule. An organisation is the lower-cased domain after the last `@` once
-- that domain holds at least 3 accounts in all, `Personal email` for a
-- domain in `webmail_domain`, and `Other organisations` for every other
-- domain. It holds the accounts created before today, UTC, as
-- `account_daily` counts them, and no rows while `webmail_domain` is empty,
-- so webmail domains never show by name. The view runs with the migrator's
-- rights, its owner's, so `website_export_reader` reads the user id and
-- the label and no email address or domain below the threshold. The event
-- export Job (db/export-events.ts) digests the user id under
-- EXPORT_ID_HMAC_KEY, as it digests the user id of every event, and writes
-- only the digest to BigQuery.
CREATE VIEW "account_organisation" AS
WITH account AS (
	SELECT "id", "created_at"::date AS day, lower(substring("email" FROM '[^@]*$')) AS domain
	FROM "user"
	WHERE "created_at" < (now() AT TIME ZONE 'UTC')::date
		AND EXISTS (SELECT 1 FROM "webmail_domain")
)
SELECT "id" AS user_id, day AS created_day,
	CASE
		WHEN domain IN (SELECT "domain" FROM "webmail_domain") THEN 'Personal email'
		WHEN count(*) OVER (PARTITION BY domain) >= 3 THEN domain
		ELSE 'Other organisations'
	END AS organisation
FROM account;
--> statement-breakpoint
GRANT SELECT ON "account_organisation" TO website_export_reader;
--> statement-breakpoint
-- `account_daily` counts the rows of `account_organisation`, so both apply
-- one labelling rule to one set of accounts. It holds every UTC day from the
-- first account's through yesterday's, a day without new accounts as one
-- row with a NULL organisation and 0 accounts, and no rows while
-- `webmail_domain` is empty, as migration 0021 defined it.
-- CREATE OR REPLACE keeps the view's grant to `website_export_reader`.
CREATE OR REPLACE VIEW "account_daily" AS
WITH counted AS (
	SELECT created_day AS day, organisation, count(*)::int AS accounts
	FROM "account_organisation"
	GROUP BY created_day, organisation
),
days AS (
	SELECT generate_series(min(created_day), (now() AT TIME ZONE 'UTC')::date - 1, interval '1 day')::date AS day
	FROM "account_organisation"
)
SELECT days.day, counted.organisation, coalesce(counted.accounts, 0) AS accounts
FROM days
LEFT JOIN counted USING (day);
