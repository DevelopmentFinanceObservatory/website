/**
 * `sheetsExport.ts`: the handler's decision flow with every collaborator
 * faked. Each case checks the status and code, what reached `fetch`, and
 * that the reader's token and Google's response bodies stay out of the
 * answer and the log.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { DRIVE_FILE_SCOPE, SHEETS_API, type SheetsAnswer } from '../googleSheet.ts';
import {
    chooseGoogleAccount,
    createGoogleSheet,
    isUsableToken,
    readGoogleAccessWith,
    type GoogleAccess,
    type ReadBody,
    type SheetsExportDeps,
} from '../sheetsExport.ts';

const TOKEN = 'ya29.reader-token-secret';
const GOOGLE_SECRET = 'google-body-secret';
const SHEET_ID = '1AbC-dEf_9';

const request = {
    title: 'Financial flow',
    generation: 'g-1',
    columns: [
        { name: 'source_code', kind: 'reference', lookup: null },
        {
            name: 'nettingBasis',
            kind: 'property',
            lookup: {
                valueList: 'NettingBasisEnum',
                members: [{ id: 'Gross', label: 'gross', code: null }],
                complete: true,
            },
        },
    ],
    rows: [['EX-1', 'Gross']],
};

type Reply = { status: number; body?: unknown } | 'network_error';

type Run = {
    result: Awaited<ReturnType<typeof createGoogleSheet>>;
    calls: { url: string; init: RequestInit }[];
    logs: string[];
    steps: string[];
};

/** Runs the flow with fakes; `replies` answer the fetch calls in order. */
const run = async ({
    decision = 'admitted',
    body = { ok: true, value: request },
    access = { kind: 'ready', accessToken: TOKEN },
    replies = [
        {
            status: 200,
            body: {
                spreadsheetId: SHEET_ID,
                spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`,
            },
        },
        { status: 200, body: {} },
    ],
}: {
    decision?: Awaited<ReturnType<SheetsExportDeps['decide']>>['kind'];
    body?: ReadBody;
    access?: GoogleAccess;
    replies?: Reply[];
} = {}): Promise<Run> => {
    const calls: Run['calls'] = [];
    const logs: string[] = [];
    const steps: string[] = [];
    const queue = [...replies];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
        steps.push('fetch');
        calls.push({ url: String(url), init: init ?? {} });
        const reply = queue.shift() ?? { status: 500 };
        if (reply === 'network_error') {
            throw new TypeError(`fetch failed ${GOOGLE_SECRET}`, {
                cause: Object.assign(new Error(GOOGLE_SECRET), { code: 'ENOTFOUND' }),
            });
        }
        return new Response(JSON.stringify(reply.body ?? { error: GOOGLE_SECRET }), {
            status: reply.status,
        });
    };
    const result = await createGoogleSheet({
        decide: async () => {
            steps.push('decide');
            return { kind: decision };
        },
        readBody: async () => {
            steps.push('body');
            return body;
        },
        googleAccess: async () => {
            steps.push('access');
            return access;
        },
        fetch: fakeFetch as typeof fetch,
        today: '2026-11-13',
        log: (message, fields) => logs.push(`${message} ${JSON.stringify(fields)}`),
    });
    return { result, calls, logs, steps };
};

/** Nothing the reader or the log receives carries the token or Google's body. */
const assertNoLeak = ({ result, logs }: Run) => {
    for (const text of [JSON.stringify(result), ...logs]) {
        assert.ok(!text.includes(TOKEN), 'the token leaked');
        assert.ok(!text.includes(GOOGLE_SECRET), "Google's response leaked");
    }
};

const code = (body: SheetsAnswer) => (body.ok ? 'ok' : body.code);

for (const [decision, status] of [
    ['signed_out', 401],
    ['email_not_verified', 403],
    ['domain_not_allowed', 403],
] as const) {
    test(`${decision} answers ${status} before the body is read or Google is called`, async () => {
        const outcome = await run({ decision });
        assert.equal(outcome.result.status, status);
        assert.equal(code(outcome.result.body), decision);
        assert.deepEqual(outcome.steps, ['decide']);
        assertNoLeak(outcome);
    });
}

test('a body that breaks its bounds answers 400 before Google access is read', async () => {
    for (const body of [
        { ok: false } as const,
        { ok: true, value: { ...request, rows: [['one']] } } as const,
    ]) {
        const outcome = await run({ body });
        assert.equal(outcome.result.status, 400);
        assert.equal(code(outcome.result.body), 'invalid_body');
        assert.deepEqual(outcome.steps, ['decide', 'body']);
    }
});

for (const reason of ['no_google_account', 'scope_missing', 'token_expired'] as const) {
    test(`${reason} answers 409 google_access_needed without calling Google`, async () => {
        const outcome = await run({ access: { kind: 'missing', reason } });
        assert.equal(outcome.result.status, 409);
        assert.deepEqual(
            [
                code(outcome.result.body),
                'reason' in outcome.result.body && outcome.result.body.reason,
            ],
            ['google_access_needed', reason],
        );
        assert.equal(outcome.calls.length, 0);
    });
}

test('a failed auth call answers 502 auth_failed, logged with its cause, without calling Google', async () => {
    const outcome = await run({
        access: { kind: 'failed', step: 'list_accounts', cause: 'DrizzleQueryError' },
    });
    assert.equal(outcome.result.status, 502);
    assert.equal(code(outcome.result.body), 'auth_failed');
    assert.equal(outcome.calls.length, 0);
    assert.deepEqual(outcome.logs, [
        'sheets export: reading Google access failed at list_accounts {"status":null,"cause":"DrizzleQueryError"}',
    ]);
});

test('a failed token read in Better Auth answers 502 google_renewal_failed, logged with its cause, without calling Google', async () => {
    const outcome = await run({
        access: { kind: 'renewal_failed', cause: 'APIError FAILED_TO_GET_ACCESS_TOKEN 400' },
    });
    assert.equal(outcome.result.status, 502);
    assert.equal(code(outcome.result.body), 'google_renewal_failed');
    assert.equal(outcome.calls.length, 0);
    assert.equal(outcome.logs.length, 1);
    assert.ok(
        outcome.logs[0]?.endsWith(
            '{"status":null,"cause":"APIError FAILED_TO_GET_ACCESS_TOKEN 400"}',
        ),
    );
});

/** A Better Auth APIError as the installed version throws it: a status and a body with a code. */
const authError = (code: string) =>
    Object.assign(new Error(`failed ${TOKEN}`), {
        name: 'APIError',
        statusCode: 400,
        body: { code, message: 'x' },
    });

const google = { id: 'acc-1', providerId: 'google', scopes: [DRIVE_FILE_SCOPE] };
const NOW = new Date('2026-11-13T12:00:00Z');

test('reading Google access tells a reason to ask for access from a failed auth call', async () => {
    const read = (deps: Partial<Parameters<typeof readGoogleAccessWith>[0]>) =>
        readGoogleAccessWith({
            listAccounts: async () => [google],
            accessToken: async () => ({ accessToken: TOKEN }),
            now: NOW,
            ...deps,
        });

    assert.deepEqual(await read({}), { kind: 'ready', accessToken: TOKEN });
    assert.deepEqual(await read({ listAccounts: async () => [] }), {
        kind: 'missing',
        reason: 'no_google_account',
    });
    assert.deepEqual(
        await read({
            accessToken: async () => ({
                accessToken: TOKEN,
                accessTokenExpiresAt: new Date('2026-11-13T11:00:00Z'),
            }),
        }),
        { kind: 'missing', reason: 'token_expired' },
    );

    const renewal = await read({
        accessToken: async () => {
            throw authError('FAILED_TO_GET_ACCESS_TOKEN');
        },
    });
    assert.deepEqual(renewal, {
        kind: 'renewal_failed',
        cause: 'APIError FAILED_TO_GET_ACCESS_TOKEN 400',
    });

    const outage = await read({
        listAccounts: async () => {
            throw new TypeError(`connect ECONNREFUSED ${TOKEN}`);
        },
    });
    assert.deepEqual(outage, { kind: 'failed', step: 'list_accounts', cause: 'TypeError' });

    const unauthorised = await read({
        accessToken: async () => {
            throw authError('UNAUTHORIZED');
        },
    });
    assert.deepEqual(unauthorised, {
        kind: 'failed',
        step: 'access_token',
        cause: 'APIError UNAUTHORIZED 400',
    });
    for (const outcome of [renewal, outage, unauthorised]) {
        assert.ok(!JSON.stringify(outcome).includes(TOKEN), 'the token leaked');
    }
});

for (const status of [403, 500]) {
    test(`Google answering ${status} on create answers 502 and logs only the status`, async () => {
        const outcome = await run({ replies: [{ status }] });
        assert.equal(outcome.result.status, 502);
        assert.equal(code(outcome.result.body), 'google_failed');
        assert.equal(outcome.calls.length, 1);
        assert.deepEqual(outcome.logs, [
            `sheets export: Google refused create {"status":${status}}`,
        ]);
        assertNoLeak(outcome);
    });
}

test('a Google refusal logs its status and reasons from the error body, and nothing else from it', async () => {
    const refusal = {
        status: 403,
        body: {
            error: {
                code: 403,
                message: GOOGLE_SECRET,
                status: 'PERMISSION_DENIED',
                details: [
                    {
                        '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                        reason: 'SERVICE_DISABLED',
                    },
                    { reason: GOOGLE_SECRET },
                ],
            },
        },
    };
    const created = {
        status: 200,
        body: { spreadsheetId: SHEET_ID },
    };
    const onCreate = await run({ replies: [refusal] });
    const onDropdowns = await run({ replies: [created, refusal] });
    assert.deepEqual(
        [...onCreate.logs, ...onDropdowns.logs],
        [
            'sheets export: Google refused create {"status":403,"cause":"PERMISSION_DENIED SERVICE_DISABLED"}',
            'sheets export: Google refused dropdowns {"status":403,"cause":"PERMISSION_DENIED SERVICE_DISABLED"}',
        ],
    );
    assertNoLeak(onCreate);
    assertNoLeak(onDropdowns);
});

test('Google answering 401 on create asks for Google access again', async () => {
    const outcome = await run({ replies: [{ status: 401 }] });
    assert.equal(outcome.result.status, 409);
    assert.equal(code(outcome.result.body), 'google_access_needed');
    assertNoLeak(outcome);
});

test('a network failure or an unreadable create response answers 502', async () => {
    for (const replies of [
        ['network_error'] as Reply[],
        [{ status: 200, body: { spreadsheetId: 'a/b' } }],
    ]) {
        const outcome = await run({ replies });
        assert.equal(outcome.result.status, 502);
        assertNoLeak(outcome);
    }
});

test('a thrown Google call logs the error and its network code', async () => {
    const onCreate = await run({ replies: ['network_error'] });
    const onDropdowns = await run({
        replies: [{ status: 200, body: { spreadsheetId: SHEET_ID } }, 'network_error'],
    });
    assert.deepEqual(
        [...onCreate.logs, ...onDropdowns.logs],
        [
            'sheets export: create request failed {"status":null,"cause":"TypeError ENOTFOUND"}',
            'sheets export: dropdown request failed {"status":null,"cause":"TypeError ENOTFOUND"}',
        ],
    );
});

test('dropdowns failing after the sheet exists still answer the sheet, marked failed', async () => {
    for (const second of [{ status: 500 }, 'network_error'] as Reply[]) {
        const outcome = await run({
            replies: [
                {
                    status: 200,
                    body: {
                        spreadsheetId: SHEET_ID,
                        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`,
                    },
                },
                second,
            ],
        });
        assert.equal(outcome.result.status, 200);
        assert.deepEqual(outcome.result.body, {
            ok: true,
            url: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`,
            dropdowns: 'failed',
        });
        assert.equal(outcome.logs.length, 1);
        assertNoLeak(outcome);
    }
});

test('success creates the sheet, then sets its dropdowns, with the token only in the header', async () => {
    const outcome = await run();
    assert.equal(outcome.result.status, 200);
    assert.deepEqual(outcome.result.body, {
        ok: true,
        url: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`,
        dropdowns: 'added',
    });
    assert.deepEqual(outcome.steps, ['decide', 'body', 'access', 'fetch', 'fetch']);
    assert.deepEqual(
        outcome.calls.map((call) => call.url),
        [
            `${SHEETS_API}?fields=spreadsheetId,spreadsheetUrl`,
            `${SHEETS_API}/${SHEET_ID}:batchUpdate`,
        ],
    );
    for (const call of outcome.calls) {
        assert.equal(call.init.method, 'POST');
        assert.equal(new Headers(call.init.headers).get('authorization'), `Bearer ${TOKEN}`);
        assert.ok(!String(call.init.body).includes(TOKEN));
    }
    const created = JSON.parse(String(outcome.calls[0]?.init.body));
    assert.equal(created.properties.title, 'Financial flow mapping sheet');
    const dropdowns = JSON.parse(String(outcome.calls[1]?.init.body));
    assert.equal(dropdowns.requests.length, 1);
    assert.deepEqual(outcome.logs, []);
});

test('a create response with an unexpected URL answers the docs.google.com address', async () => {
    const outcome = await run({
        replies: [
            {
                status: 200,
                body: { spreadsheetId: SHEET_ID, spreadsheetUrl: 'https://evil.example/x' },
            },
            { status: 200 },
        ],
    });
    assert.equal(
        outcome.result.body.ok && outcome.result.body.url,
        `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`,
    );
});

test('a sheet with no value-list column skips the dropdown request', async () => {
    const outcome = await run({
        body: {
            ok: true,
            value: {
                ...request,
                columns: request.columns.map((column) => ({ ...column, lookup: null })),
            },
        },
    });
    assert.equal(outcome.calls.length, 1);
    assert.equal(outcome.result.body.ok && outcome.result.body.dropdowns, 'none');
});

test('the Google account chosen is one granted drive.file', () => {
    const account = (id: string, providerId: string, scopes: string[]) => ({
        id,
        providerId,
        scopes,
    });
    assert.equal(
        chooseGoogleAccount([account('a', 'github', [DRIVE_FILE_SCOPE])]),
        'no_google_account',
    );
    assert.equal(
        chooseGoogleAccount([account('a', 'google', ['email', 'openid'])]),
        'scope_missing',
    );
    assert.deepEqual(
        chooseGoogleAccount([
            account('a', 'google', ['email']),
            account('b', 'google', ['email', DRIVE_FILE_SCOPE]),
        ]),
        account('b', 'google', ['email', DRIVE_FILE_SCOPE]),
    );
});

test('a token past its expiry or empty is unusable', () => {
    const now = new Date('2026-11-13T12:00:00Z');
    assert.equal(
        isUsableToken(
            { accessToken: 't', accessTokenExpiresAt: new Date('2026-11-13T12:30:00Z') },
            now,
        ),
        true,
    );
    assert.equal(
        isUsableToken({ accessToken: 't', accessTokenExpiresAt: '2026-11-13T11:59:00Z' }, now),
        false,
    );
    assert.equal(isUsableToken({ accessToken: 't' }, now), true);
    assert.equal(isUsableToken({ accessToken: '' }, now), false);
});
