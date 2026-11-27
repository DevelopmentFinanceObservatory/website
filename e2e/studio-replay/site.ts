/**
 * Starts the production build's standalone server (`pnpm build` first) on a
 * free localhost port, with a made-up environment that satisfies
 * src/instrumentation.ts's production checks and reaches nothing: the
 * search API address points at a closed localhost port, the database is the
 * reader's throwaway one (account.ts) or a closed port, keys and visitor
 * limits are off, and no other variable (Sentry, analytics, the Studio
 * harness) is set. The standalone directory holds no env file, so
 * the server reads none.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const BUILD = path.join(ROOT, '.next');
const STANDALONE = path.join(BUILD, 'standalone');
// Port 9 (discard) on localhost: nothing listens, so a call fails at once.
const NOWHERE = 'http://127.0.0.1:9';
const START_MS = 60_000;

const freePort = () =>
    new Promise<number>((resolve, reject) => {
        const probe = createServer();

        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const address = probe.address();
            const port = typeof address === 'object' && address ? address.port : 0;

            probe.close(() => resolve(port));
        });
    });

// The standalone server serves .next/static and public/ from beside it, as
// deploy/Dockerfile copies them; links do the same for a local build.
const linkAssets = () => {
    const links: [string, string][] = [
        [path.join(STANDALONE, '.next', 'static'), path.join(BUILD, 'static')],
        [path.join(STANDALONE, 'public'), path.join(ROOT, 'public')],
    ];

    for (const [link, target] of links) {
        if (!existsSync(link)) {
            symlinkSync(target, link);
        }
    }
};

/** Resolves with the site's origin and a `stop` once /studio answers 200.
 *  With `database`, the site signs readers in against that database's
 *  sessions, signed with its `secret` (account.ts). */
export const startSite = async (database?: {
    databaseUrl: string;
    secret: string;
}): Promise<{ url: string; stop: () => Promise<void> }> => {
    if (!existsSync(path.join(STANDALONE, 'server.js'))) {
        throw new Error('No production build: run `pnpm build` first.');
    }

    linkAssets();

    const port = await freePort();
    const url = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, [path.join(STANDALONE, 'server.js')], {
        cwd: STANDALONE,
        env: {
            PATH: process.env.PATH,
            NODE_ENV: 'production',
            NEXT_TELEMETRY_DISABLED: '1',
            HOSTNAME: '127.0.0.1',
            PORT: String(port),
            SEARCH_API_BASE: NOWHERE,
            DATABASE_URL: database?.databaseUrl ?? 'postgresql://replay:replay@127.0.0.1:9/replay',
            BETTER_AUTH_SECRET: database?.secret ?? randomBytes(32).toString('base64'),
            BETTER_AUTH_URL: url,
            API_KEYS_ENABLED: 'false',
            VISITOR_LIMITS_ENABLED: 'false',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';

    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));

    const stop = () =>
        new Promise<void>((resolve) => {
            if (child.exitCode !== null) {
                resolve();

                return;
            }

            child.once('exit', () => resolve());
            child.kill('SIGTERM');
        });
    const deadline = Date.now() + START_MS;

    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(`The site exited before it served /studio:\n${output}`);
        }

        try {
            const res = await fetch(`${url}/studio`);

            if (res.ok) {
                return { url, stop };
            }
        } catch {
            // Not listening yet.
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    await stop();
    throw new Error(`The site did not serve /studio within ${START_MS / 1000} s:\n${output}`);
};
