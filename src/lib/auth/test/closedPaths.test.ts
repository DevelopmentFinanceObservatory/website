/**
 * `closedPaths.ts` on a real Better Auth with an in-memory database: the
 * token endpoints answer 404 over HTTP, and the server's own
 * `auth.api.getAccessToken` still reads the stored token.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';

import { TOKEN_PATHS } from '../closedPaths.ts';

const BASE = 'http://localhost:3000';
const TOKEN = 'stored-google-token';

const setup = (disabledPaths: string[]) => {
    const now = new Date();
    const db: Record<string, Record<string, unknown>[]> = {
        user: [
            {
                id: 'u1',
                name: 'Reader',
                email: 'reader@partner.example',
                emailVerified: true,
                createdAt: now,
                updatedAt: now,
            },
        ],
        session: [],
        account: [
            {
                id: 'a1',
                userId: 'u1',
                providerId: 'google',
                accountId: 'g1',
                accessToken: TOKEN,
                accessTokenExpiresAt: new Date(now.getTime() + 3_600_000),
                createdAt: now,
                updatedAt: now,
            },
        ],
        verification: [],
    };

    return betterAuth({
        baseURL: BASE,
        secret: 'a-test-secret-long-enough-for-better-auth',
        database: memoryAdapter(db),
        socialProviders: { google: { clientId: 'id', clientSecret: 'secret' } },
        disabledPaths,
    });
};

const post = (auth: ReturnType<typeof setup>, path: string) =>
    auth.handler(
        new Request(`${BASE}/api/auth${path}`, {
            method: path === '/account-info' ? 'GET' : 'POST',
            headers: { 'content-type': 'application/json', origin: BASE },
            body: path === '/account-info' ? undefined : JSON.stringify({ accountId: 'a1' }),
        }),
    );

test('each token endpoint answers 404 over HTTP, and answers without the list', async () => {
    const closed = setup([...TOKEN_PATHS]);
    const open = setup([]);

    for (const path of TOKEN_PATHS) {
        assert.equal((await post(closed, path)).status, 404, path);
        assert.notEqual((await post(open, path)).status, 404, path);
    }
});

test('the server still reads the stored token through auth.api', async () => {
    const auth = setup([...TOKEN_PATHS]);
    const token = await auth.api.getAccessToken({
        body: { accountId: 'a1', userId: 'u1' },
    });

    assert.equal(token.accessToken, TOKEN);
});
