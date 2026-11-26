import { createHmac, randomBytes } from 'node:crypto';

import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { clientAddress, limiterBucket } from '../proxy/caller.ts';

/**
 * The daily visitor key on each event (`event.day_visitor`): the first 32
 * hex characters of HMAC-SHA-256 over the client address's bucket
 * (limiterBucket) and the User-Agent, joined by a newline, keyed by a random
 * salt that serves one UTC day (table `day_salt`). The same browser on the
 * same network gets one key all day and an unrelated key the next day. The
 * first event of a day creates its salt and deletes every earlier day's, so
 * a past day's keys cannot be recomputed from the live database once the next
 * day's first event has run (backups keep a deleted salt until they expire).
 * Rows that also carry a user id or a consented visitor id join across days
 * through those, as they always have. Nothing is stored on the device,
 * and the key is kept out of the event log line and PostHog.
 *
 * The client address is the one the rate limiter and the caller digest read
 * (clientAddress in src/lib/proxy/caller.ts), under TRUSTED_PROXY_HOPS. Each
 * function takes the database handle first, so `node --test` runs them on a
 * migrated test database.
 */
type SaltTx = Pick<NodePgDatabase, 'execute'>;
export type SaltDb = { transaction: <T>(run: (tx: SaltTx) => Promise<T>) => Promise<T> };

const KEY_LENGTH = 32;
const SALT_BYTES = 32;
// The advisory lock key of fetchDaySalt, unique to it in this database.
const SALT_LOCK = 0x64617973; // 'days'

/** The UTC date of `at`, as `YYYY-MM-DD`. */
export const utcDay = (at: Date): string => at.toISOString().slice(0, 10);

/**
 * The salt of `day`, created when the day has none and no later day exists,
 * and every earlier day's row deleted. Concurrent first calls from several
 * servers insert one row between them and all read it back. A call for a day
 * that has already been followed by a later one finds no salt and throws, so
 * a deleted day's salt is never made again.
 */
export const fetchDaySalt = (db: SaltDb, day: string): Promise<Buffer> =>
    db.transaction(async (tx) => {
        // One get-or-create at a time across every server, so a call for an
        // earlier day cannot pass the later-day check on a snapshot taken
        // before another server's newer day committed.
        await tx.execute(sql`select pg_advisory_xact_lock(${SALT_LOCK})`);
        await tx.execute(sql`
            insert into day_salt (day, salt)
            select ${day}::date, ${randomBytes(SALT_BYTES)}::bytea
            where not exists (select 1 from day_salt where day > ${day}::date)
            on conflict (day) do nothing`);
        await tx.execute(sql`delete from day_salt where day < ${day}::date`);

        const { rows } = await tx.execute<{ salt: Buffer }>(
            sql`select salt from day_salt where day = ${day}::date`,
        );
        const salt = rows[0]?.salt;

        if (!salt) {
            throw new Error(`no visitor key salt for ${day}`);
        }

        return salt;
    });

/** The visitor key for a client address bucket and user agent under `salt`. */
export const dayVisitorKey = (salt: Buffer, bucket: string, userAgent: string): string =>
    createHmac('sha256', salt).update(`${bucket}\n${userAgent}`).digest('hex').slice(0, KEY_LENGTH);

/**
 * The resolver for a request's daily visitor key, from `hops` (trustedHops):
 * null without headers, without a client address or with a malformed
 * TRUSTED_PROXY_HOPS. `at` is the moment the key is for, so a caller that
 * also stores a timestamp keys the row's own day. Each server reads a day's salt from the database once
 * and keeps it in memory for the rest of that day. A failed read gives null
 * and leaves the next call to try again.
 */
export const dayVisitorResolver = (
    db: SaltDb,
    hops: number | { problem: string },
    now: () => Date = () => new Date(),
): ((headers: Headers | null, at?: Date) => Promise<string | null>) => {
    let cached: { day: string; salt: Promise<Buffer> } | undefined;

    const saltFor = (day: string): Promise<Buffer> => {
        if (cached?.day === day) {
            return cached.salt;
        }

        const salt = fetchDaySalt(db, day);

        // A late event for an earlier day keeps today's cached salt.
        if (cached === undefined || day > cached.day) {
            cached = { day, salt };
            salt.catch(() => {
                if (cached?.salt === salt) cached = undefined;
            });
        }

        return salt;
    };

    return async (headers, at = now()) => {
        if (headers === null || typeof hops !== 'number') {
            return null;
        }

        const address = clientAddress(headers.get('x-forwarded-for'), hops);

        if (!address) {
            return null;
        }

        try {
            const salt = await saltFor(utcDay(at));

            return dayVisitorKey(salt, limiterBucket(address), headers.get('user-agent') ?? '');
        } catch (error) {
            console.warn('day visitor key not computed', error);

            return null;
        }
    };
};
