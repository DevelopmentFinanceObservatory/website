-- `account_daily` holds the UTC days through yesterday's and counts only
-- the accounts created before today, UTC, so a domain it names holds at
-- least 3 of the accounts the export carries.
-- CREATE OR REPLACE keeps the view's grant to `website_export_reader`.
CREATE OR REPLACE VIEW "account_daily" AS
WITH account AS (
	SELECT "created_at"::date AS day, lower(substring("email" FROM '[^@]*$')) AS domain
	FROM "user"
	WHERE "created_at" < (now() AT TIME ZONE 'UTC')::date
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
-- Why `account_daily` holds no rows: whether the user table holds any
-- account, and whether `webmail_domain` holds any domain. The account
-- export reads it in the same transaction as the view, and fails on no rows
-- when either is empty. It runs with the migrator's rights, like the view,
-- and leaves no email address or user id with the reader.
CREATE VIEW "account_daily_source" AS
SELECT
	EXISTS (SELECT 1 FROM "user") AS accounts,
	EXISTS (SELECT 1 FROM "webmail_domain") AS webmail_domains;
--> statement-breakpoint
GRANT SELECT ON "account_daily_source" TO website_export_reader;
