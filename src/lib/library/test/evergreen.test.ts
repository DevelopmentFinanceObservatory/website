import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { TypeSafeClient } from '@typesafe-ai/sdk';

const { BATCH_CONCURRENCY, CLIENT_CONFIG, MODEL, checkEvergreenKey, evergreenRefusal } =
    await import('../evergreen.ts');
const { GROUP_SIZE, REASONS, candidatesOf } = await import('../evergreenRule.ts');
const { LIMITS } = await import('../publish.ts');

type Sent = {
    model: string;
    state: { sentences: { text: string }[] };
    questions: Record<string, { type: string }>;
};

// Jev's answers by sentence: its Noul and the claim kind it names.
type Verdicts = Record<string, [number, string]>;

type Reply = {
    verdicts?: Verdicts;
    status?: number;
    retryAfter?: string;
    hang?: true;
    drop?: string;
    model?: string;
};

// A stand-in for TypeSafe's API that answers every question it is sent from
// `verdicts`, or answers with `status`, or never answers. `calls` holds the
// requests it was sent, and `peak` the most it held at once.
const standIn = (
    reply: Reply,
    overrides: Partial<ConstructorParameters<typeof TypeSafeClient>[0]> = {},
) => {
    const calls: Sent[] = [];
    const flight = { now: 0, peak: 0 };
    const answer = async (sent: Sent, init?: RequestInit): Promise<Response> => {
        // Answer on a later turn, so requests sent together overlap.
        await new Promise((resolve) => setTimeout(resolve, 1));

        if (reply.hang) {
            return new Promise((_, reject) =>
                init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)),
            );
        }

        if (reply.status) {
            return Response.json(
                { detail: 'stand-in' },
                {
                    status: reply.status,
                    headers: reply.retryAfter ? { 'Retry-After': reply.retryAfter } : {},
                },
            );
        }

        const answers = Object.fromEntries(
            Object.entries(sent.questions).flatMap(([id, question]) => {
                if (id === reply.drop) {
                    return [];
                }

                const index = Number(id.split('_').at(-1));
                const [noul, kind] = reply.verdicts?.[sent.state.sentences[index].text] ?? [
                    0.02,
                    'other',
                ];

                return [
                    [
                        id,
                        question.type === 'noul'
                            ? { type: 'noul', noul }
                            : {
                                  type: 'choice',
                                  choice: kind,
                                  confidence: 0.9,
                                  probabilities: { [kind]: 0.92 },
                              },
                    ],
                ];
            }),
        );

        return Response.json({ model: reply.model ?? sent.model, answers, usage: {} });
    };
    const fetch = async (_url: string, init?: RequestInit): Promise<Response> => {
        const sent = JSON.parse(String(init?.body)) as Sent;

        calls.push(sent);
        flight.now += 1;
        flight.peak = Math.max(flight.peak, flight.now);

        try {
            return await answer(sent, init);
        } finally {
            flight.now -= 1;
        }
    };
    const client = () =>
        new TypeSafeClient({
            ...CLIENT_CONFIG,
            apiKey: 'stand-in',
            compression: false,
            fetch,
            ...overrides,
            retry: { ...CLIENT_CONFIG.retry, backoffInitialMs: 1, backoffJitter: 0 },
        });

    return { calls, flight, client };
};

const SUBJECT = { publishKey: 'key-1' };

const ENV = ['LIBRARY_EVERGREEN_CHECK', 'TYPESAFE_API_KEY'] as const;
const saved = new Map<string, string | undefined>();
let logged: string[] = [];
const consoleWarn = console.warn;
const consoleError = console.error;

beforeEach(() => {
    for (const name of ENV) {
        saved.set(name, process.env[name]);
        delete process.env[name];
    }

    logged = [];
    console.warn = (...args: unknown[]) => logged.push(args.join(' '));
    console.error = (...args: unknown[]) => logged.push(args.join(' '));
});

afterEach(() => {
    for (const name of ENV) {
        const value = saved.get(name);

        if (value === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = value;
        }
    }

    console.warn = consoleWarn;
    console.error = consoleError;
});

const CONTENT = 'This chart shows ODA as a share of income. Norway gives the most.';
const TEXT = { title: 'ODA by donor', description: 'How much each donor gives.', content: CONTENT };

const body = async (response: Response | null) => {
    assert.ok(response);

    return (await response.json()) as Record<string, unknown>;
};

test('a sentence that states what the data shows now is refused at its field and offsets', async () => {
    const { calls, client } = standIn({
        verdicts: { 'Norway gives the most.': [0.96, 'ranking'] },
    });
    const response = await evergreenRefusal(TEXT, SUBJECT, client);

    assert.equal(response?.status, 400);
    assert.equal(response?.headers.get('Cache-Control'), 'no-store');

    const document = await body(response);
    const start = CONTENT.indexOf('Norway');

    assert.equal(document.code, 'not_evergreen');
    assert.equal(document.pointer, '/content');
    assert.deepEqual(document.errors, [
        {
            pointer: '/content',
            start,
            end: CONTENT.length,
            quote: CONTENT.slice(start),
            kind: 'ranking',
            reason: REASONS.ranking,
        },
    ]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, MODEL);
    assert.equal(calls[0].state.sentences.length, 4);
    assert.ok(!logged.some((line) => line.includes('Norway')));
});

test('evergreen text passes, and a doubtful sentence is logged without its text', async () => {
    const { client } = standIn({ verdicts: { 'Norway gives the most.': [0.5, 'ranking'] } });

    assert.equal(await evergreenRefusal(TEXT, SUBJECT, client), null);
    assert.equal(logged.length, 1);
    assert.equal(JSON.parse(logged[0]).message, 'library_evergreen_doubt');
    assert.equal(JSON.parse(logged[0]).publishKey, SUBJECT.publishKey);
    assert.ok(!logged[0].includes('Norway'));
});

// A long Retry-After that the client honoured would hold this test for 50 s.
test(
    'the check answers 503 when TypeSafe cannot answer, and logs no text',
    { timeout: 10_000 },
    async () => {
        const cases: [string, Parameters<typeof standIn>, number, string][] = [
            ['rate limited', [{ status: 429 }], 2, 'http'],
            ['rate limited for long', [{ status: 429, retryAfter: '50' }], 2, 'http'],
            ['server error', [{ status: 500 }], 2, 'http'],
            ['bad key', [{ status: 401 }], 1, 'http'],
            ['timeout', [{ hang: true }, { timeout: 20 }], 1, 'timeout'],
            ['unanswered question', [{ drop: 'kind_3' }], 1, 'unanswered'],
            ['another model', [{ model: 'jev-1.13.0' }], 1, 'model'],
        ];

        for (const [name, args, sent, cause] of cases) {
            logged = [];

            const { calls, client } = standIn(...args);
            const response = await evergreenRefusal(TEXT, SUBJECT, client);

            assert.equal(response?.status, 503, name);
            assert.equal(response?.headers.get('Retry-After'), '5', name);
            assert.equal(response?.headers.get('Cache-Control'), 'no-store', name);
            assert.equal((await body(response)).code, 'evergreen_check_unavailable', name);
            assert.equal(calls.length, sent, name);
            assert.equal(logged.length, 1, name);
            assert.deepEqual(
                [JSON.parse(logged[0]).cause, JSON.parse(logged[0]).publishKey],
                [cause, SUBJECT.publishKey],
                name,
            );
            assert.ok(!logged[0].includes('Norway') && !logged[0].includes('stand-in'), name);
        }
    },
);

test('a request TypeSafe refuses for its content answers 502 with no retry', async () => {
    for (const status of [400, 413, 422]) {
        logged = [];

        const { calls, client } = standIn({ status });
        const response = await evergreenRefusal(TEXT, { artifact: 'a1' }, client);

        assert.equal(response?.status, 502, String(status));
        assert.equal(response?.headers.get('Retry-After'), null, String(status));
        assert.equal((await body(response)).code, 'evergreen_check_refused', String(status));
        assert.equal(calls.length, 1, String(status));
        assert.deepEqual(
            [JSON.parse(logged[0]).message, JSON.parse(logged[0]).artifact],
            ['library_evergreen_refused', 'a1'],
        );
    }
});

test('a text near the length limit is asked about in parallel batches of GROUP_SIZE', async () => {
    const lines: string[] = [];

    for (let n = 1; [...lines, 'x'].join('\n').length < LIMITS.content - 60; n += 1) {
        lines.push(`Row ${n} of the table reads one donor's figure for the year shown.`);
    }

    const content = lines.join('\n');
    const last = lines.at(-1) ?? '';
    const { calls, flight, client } = standIn({ verdicts: { [last]: [0.9, 'figure'] } });
    const response = await evergreenRefusal({ content }, SUBJECT, client);
    const candidates = candidatesOf({ content }).length;

    assert.ok(content.length > LIMITS.content - 100 && content.length <= LIMITS.content);
    assert.equal(calls.length, Math.ceil(candidates / GROUP_SIZE));
    assert.ok(calls.every((call) => call.state.sentences.length <= GROUP_SIZE));
    assert.ok(flight.peak > 1 && flight.peak <= BATCH_CONCURRENCY, String(flight.peak));
    assert.deepEqual(
        ((await body(response)).errors as { start: number; end: number }[]).map(({ start, end }) =>
            content.slice(start, end),
        ),
        [last],
    );
});

test('without an API key the check answers 503', async () => {
    const response = await evergreenRefusal(
        TEXT,
        SUBJECT,
        () => new TypeSafeClient({ ...CLIENT_CONFIG }),
    );

    assert.equal(response?.status, 503);
    assert.equal((await body(response)).code, 'evergreen_check_unavailable');
});

test('the switch turned off, or no text, skips the call', async () => {
    const { calls, client } = standIn({ status: 500 });

    assert.equal(await evergreenRefusal({ content: null }, SUBJECT, client), null);
    assert.equal(logged.length, 0);

    process.env.LIBRARY_EVERGREEN_CHECK = ' OFF ';

    assert.equal(await evergreenRefusal(TEXT, SUBJECT, client), null);
    assert.equal(calls.length, 0);
    assert.equal(JSON.parse(logged[0]).message, 'library_evergreen_check_off');
});

test('a production server refuses to start without the key unless the check is off', () => {
    const warnings: string[] = [];

    assert.throws(() => checkEvergreenKey(true));

    checkEvergreenKey(false, (message) => warnings.push(message));
    assert.equal(warnings.length, 1);

    process.env.LIBRARY_EVERGREEN_CHECK = 'off';
    checkEvergreenKey(true);

    delete process.env.LIBRARY_EVERGREEN_CHECK;
    process.env.TYPESAFE_API_KEY = 'key';
    checkEvergreenKey(true);
});
