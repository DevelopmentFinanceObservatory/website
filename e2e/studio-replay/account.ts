/**
 * A signed-in reader, for the regressions whose behaviour belongs to an
 * account: the page saves its conversation and reads the harness's state
 * only for one. The site reads its sessions from Postgres, so this makes a
 * throwaway database on the server the PG* variables name, as `pnpm test`
 * does (db/test/harness.ts), migrates it, and adds one user with one
 * session. The site runs on that database with the same `secret`, and the
 * browser carries `cookie`, the session cookie Better Auth signs.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';

import { makeSignature } from 'better-auth/crypto';

import { applyMigrations } from '../../db/apply-migrations.ts';
import { createTestDatabase } from '../../db/test/harness.ts';

export type Reader = {
    databaseUrl: string;
    secret: string;
    cookie: { name: string; value: string };
    close: () => Promise<void>;
};

const MIGRATIONS = path.resolve(import.meta.dirname, '..', '..', 'db', 'migrations');

/** Where the reader's database lives, for a failure to name. */
export const postgresAt = () =>
    `${process.env.PGUSER ?? 'postgres'}@${process.env.PGHOST ?? 'localhost'}:${process.env.PGPORT ?? 5433}`;

export const makeReader = async (): Promise<Reader> => {
    const database = await createTestDatabase();

    try {
        await applyMigrations(database.migratorPool(), {
            migrationsFolder: MIGRATIONS,
            runtimeDbUser: database.runtimeUser,
            migratorDbUser: database.migratorUser,
        });

        // Made for this run alone and kept out of every log: the site gets
        // the secret in its own environment only.
        const secret = randomBytes(32).toString('base64');
        const token = randomBytes(24).toString('base64url');
        const userId = randomUUID();
        const admin = database.adminPool();

        await admin.query(
            'insert into "user" (id, name, email, email_verified) values ($1, $2, $3, true)',
            [userId, 'Replay reader', `reader-${userId.slice(0, 8)}@example.test`],
        );
        await admin.query(
            `insert into session (id, token, user_id, expires_at, updated_at)
             values ($1, $2, $3, now() + interval '1 day', now())`,
            [randomUUID(), token, userId],
        );

        const host = process.env.PGHOST ?? 'localhost';
        const port = process.env.PGPORT ?? 5433;
        const runtime = `${encodeURIComponent(database.runtimeUser)}:${encodeURIComponent(database.runtimePassword)}`;

        return {
            databaseUrl: `postgresql://${runtime}@${host}:${port}/${database.databaseName}`,
            secret,
            // Signed as better-call's signCookieValue signs it (Better Auth's
            // setSignedCookie): the token, a dot and the base64 HMAC-SHA256
            // of the token under the secret, URI-encoded.
            cookie: {
                name: 'better-auth.session_token',
                value: encodeURIComponent(`${token}.${await makeSignature(token, secret)}`),
            },
            close: () => database.teardown(),
        };
    } catch (error) {
        await database.teardown();
        throw error;
    }
};
