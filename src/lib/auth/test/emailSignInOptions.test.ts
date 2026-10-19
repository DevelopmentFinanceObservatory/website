/**
 * `emailSignInOptions.ts` on a real Better Auth with an in-memory database,
 * driven through its HTTP handler as the /api/auth route drives it: which
 * paths answer, what a send has to pass, and how a code signs in. Turnstile
 * is a local stub; mail and the send caps are fakes.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { after, before } from 'node:test';
import { inspect } from 'node:util';

import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { symmetricDecrypt } from 'better-auth/crypto';

import { CLIENT_IP_HEADER } from '../clientIp.ts';
import { CODE_SIGN_IN_PATH, SEND_CODE_PATH, emailSignInOptions } from '../emailSignInOptions.ts';

const BASE = 'http://localhost:3000';
const SECRET = 'a-test-secret-long-enough-for-better-auth';

// Turnstile's siteverify. The token 'pass' passes and any other fails.
const siteVerify = createServer((request, response) => {
    let body = '';

    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ success: JSON.parse(body).response === 'pass' }));
    });
});

before(() => new Promise<void>((resolve) => siteVerify.listen(0, '127.0.0.1', resolve)));
after(() => siteVerify.close());

type Message = { to: string; subject: string };

const setup = ({ capped = false, mailError }: { capped?: boolean; mailError?: Error } = {}) => {
    const sent: Message[] = [];
    const counted: string[][] = [];
    const db: Record<string, Record<string, unknown>[]> = {
        user: [],
        session: [],
        account: [],
        verification: [],
    };
    const options = emailSignInOptions(
        {
            from: 'DFO Studio <studio@developmentfinance.org>',
            turnstileSiteKey: 'site-key',
            turnstileSecretKey: 'secret-key',
        },
        {
            sendMail: async (message) => {
                if (mailError) {
                    throw mailError;
                }

                sent.push(message);
            },
            takeAllowance: async (keys) => {
                counted.push(keys.map(({ key }) => key));

                return capped ? { ok: false, retryAfterS: 1800 } : { ok: true };
            },
            siteVerifyURL: `http://127.0.0.1:${(siteVerify.address() as AddressInfo).port}`,
        },
    );
    const auth = betterAuth({
        baseURL: BASE,
        secret: SECRET,
        database: memoryAdapter(db),
        emailAndPassword: { enabled: false },
        advanced: { ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] } },
        ...options,
    });
    const call = (method: string, path: string, body?: unknown, headers = {}) =>
        auth.handler(
            new Request(`${BASE}/api/auth${path}`, {
                method,
                headers: {
                    'content-type': 'application/json',
                    origin: BASE,
                    [CLIENT_IP_HEADER]: '198.51.100.7',
                    ...headers,
                },
                body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
            }),
        );
    const send = (email: string, type = 'sign-in', token = 'pass') =>
        call('POST', SEND_CODE_PATH, { email, type }, { 'x-captcha-response': token });
    const signIn = (email: string, otp: string) => call('POST', CODE_SIGN_IN_PATH, { email, otp });

    return { options, db, sent, counted, call, send, signIn };
};

const errorOf = async (response: Response) =>
    (await response.json()) as { code?: string; message?: string };

const codeIn = (message: Message) => message.subject.match(/^\d{6}\b/)?.[0] ?? '';

test('only sending a sign-in code and signing in with it answer', async () => {
    const { options, call } = setup();
    const endpoints = Object.values(options.plugins[0].endpoints).filter(
        ({ path }) => path !== SEND_CODE_PATH && path !== CODE_SIGN_IN_PATH,
    );

    assert.ok(endpoints.length > 0);

    for (const { path, options: endpoint } of endpoints) {
        const methods = [endpoint.method].flat();

        assert.equal((await call(methods[0]!, path)).status, 404, path);
    }
});

test('a send with no Turnstile token is refused before any check or mail', async () => {
    const { call, sent, counted } = setup();
    const response = await call('POST', SEND_CODE_PATH, { email: 'ana@one.org', type: 'sign-in' });

    assert.equal(response.status, 400);
    assert.equal((await errorOf(response)).code, 'MISSING_RESPONSE');
    assert.deepEqual([sent.length, counted.length], [0, 0]);
});

for (const [label, email, type, token, code] of [
    ['a failed Turnstile check', 'ana@one.org', 'sign-in', 'fail', 'VERIFICATION_FAILED'],
    ['another code type', 'ana@one.org', 'email-verification', 'pass', 'SIGN_IN_CODES_ONLY'],
    ['a throwaway address', 'ana@mailinator.com', 'sign-in', 'pass', 'THROWAWAY_EMAIL'],
] as const) {
    test(`${label} is refused before the caps or mail`, async () => {
        const { send, sent, counted } = setup();

        assert.equal((await errorOf(await send(email, type, token))).code, code);
        assert.deepEqual([sent.length, counted.length], [0, 0]);
    });
}

test('a send past a cap is refused with the wait, and sends nothing', async () => {
    const { send, sent } = setup({ capped: true });
    const response = await send('ana@one.org');
    const error = await errorOf(response);

    assert.equal(response.status, 429);
    assert.equal(error.code, 'TOO_MANY_CODES');
    assert.match(error.message ?? '', /30 minutes/);
    assert.equal(sent.length, 0);
});

test('a code reaches the inbox, is stored encrypted, and signs in once', async () => {
    const { send, signIn, sent, counted, db } = setup();

    assert.equal((await send('Ana@One.org')).status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.to, 'ana@one.org');
    // The inbox and the client's network.
    assert.equal(counted[0]!.length, 2);

    const code = codeIn(sent[0]!);
    const stored = db.verification.map(({ value }) => String(value));

    assert.match(code, /^\d{6}$/);
    assert.equal(stored.length, 1);
    assert.ok(!stored[0]!.includes(code));
    // The value is the code encrypted under the auth secret, then `:` and the
    // wrong tries so far.
    assert.equal(
        await symmetricDecrypt({
            key: SECRET,
            data: stored[0]!.slice(0, stored[0]!.lastIndexOf(':')),
        }),
        code,
    );

    const response = await signIn('ana@one.org', code);

    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie') ?? '', /session_token=/);
    assert.equal(db.user[0]!.emailVerified, true);
    assert.equal((await errorOf(await signIn('ana@one.org', code))).code, 'INVALID_OTP');
});

test('three wrong codes use the code up', async () => {
    const { send, signIn, sent } = setup();

    await send('ana@one.org');

    const code = codeIn(sent[0]!);
    const wrong = code === '000000' ? '111111' : '000000';

    for (let attempt = 0; attempt < 3; attempt++) {
        assert.equal((await errorOf(await signIn('ana@one.org', wrong))).code, 'INVALID_OTP');
    }

    assert.equal((await errorOf(await signIn('ana@one.org', code))).code, 'TOO_MANY_ATTEMPTS');
});

test('a send the mail server refuses answers CODE_NOT_SENT and logs no address', async (t) => {
    const logged = t.mock.method(console, 'error', () => {});
    const { send } = setup({
        mailError: Object.assign(new Error('550 5.1.1 <ana@one.org>: Recipient rejected'), {
            code: 'EENVELOPE',
            responseCode: 550,
        }),
    });
    const response = await send('ana@one.org');

    assert.equal(response.status, 503);
    assert.equal((await errorOf(response)).code, 'CODE_NOT_SENT');
    assert.ok(logged.mock.callCount() > 0);
    assert.ok(!inspect(logged.mock.calls.map(({ arguments: args }) => args)).includes('ana@'));
});
