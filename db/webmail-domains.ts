import freeEmailDomains from 'free-email-domains';
import type { Pool } from 'pg';

/**
 * Rewrites `webmail_domain` (migration 0020) to the `free-email-domains`
 * package's list: free providers such as Gmail, Outlook and their regional
 * domains, and disposable ones. db/migrate.ts and db/migrate-local.ts run
 * it after the migrations. The package's postinstall script would refetch
 * the list from its upstream sources, and pnpm skips it
 * (`ignoredBuiltDependencies` in package.json), so the list is the one the
 * locked version ships. One statement, so a reader of `account_daily` sees
 * the old list or the new one.
 */
export async function syncWebmailDomains(pool: Pool): Promise<void> {
    await pool.query(
        `WITH listed AS (SELECT DISTINCT lower(unnest($1::text[])) AS domain),
         removed AS (
             DELETE FROM webmail_domain WHERE domain NOT IN (SELECT domain FROM listed)
         )
         INSERT INTO webmail_domain (domain) SELECT domain FROM listed
         ON CONFLICT DO NOTHING`,
        [freeEmailDomains],
    );
}
