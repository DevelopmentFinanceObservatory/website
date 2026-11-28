import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import {
    type Questions,
    type SystemOneRequest,
    TypeSafeClient,
    type TypeSafeClientConfig,
} from '@typesafe-ai/sdk';

import type { PeriodsFound } from '../periods.ts';

const { CLIENT_CONFIG, MAX_CANDIDATES, MODEL, REQUEST_CONCURRENCY, evergreenCheck } =
    await import('../evergreen.ts');
const { REASONS, candidatesOf } = await import('../evergreenRule.ts');
const { LIMITS } = await import('../publish.ts');

type Sent = {
    model: string;
    state: { part: string; sentence: string };
    questions: Record<string, { type: string }>;
};

// Jev's answers by sentence: its refresh Noul, and the kind question that
// scores highest.
type Verdicts = Record<string, [number, 'value' | 'ranking' | 'change' | 'period']>;

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

        const [stale, kind] = reply.verdicts?.[sent.state.sentence] ?? [0.02, 'value'];
        const answers = Object.fromEntries(
            Object.keys(sent.questions)
                .filter((id) => id !== reply.drop)
                .map((id) => [
                    id,
                    { type: 'noul', noul: id === 'stale' ? stale : id === kind ? 0.9 : 0.05 },
                ]),
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
    const config: TypeSafeClientConfig = {
        ...CLIENT_CONFIG,
        apiKey: 'stand-in',
        compression: false,
        fetch,
        ...overrides,
        retry: { ...CLIENT_CONFIG.retry, backoffInitialMs: 1, backoffJitter: 0 },
    };
    const client = () => new TypeSafeClient(config);

    return { calls, flight, client, config };
};

const SUBJECT = { publishKey: 'key-1' };

const ENV = ['TYPESAFE_API_KEY'] as const;
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
// One sentence, so each failure sends a known number of requests.
const ONE = { content: 'Norway gives the most.' };

const refusalOf = async (checked: Awaited<ReturnType<typeof evergreenCheck>>) => {
    assert.ok('refusal' in checked, JSON.stringify(checked));

    return {
        response: checked.refusal,
        document: (await checked.refusal.json()) as Record<string, unknown>,
    };
};

test('a sentence that states what the data shows now is refused at its field and offsets', async () => {
    const { calls, client } = standIn({
        verdicts: { 'Norway gives the most.': [0.96, 'ranking'] },
    });
    const { response, document } = await refusalOf(await evergreenCheck(TEXT, SUBJECT, { client }));
    const start = CONTENT.indexOf('Norway');

    assert.equal(response.status, 400);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
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
    assert.deepEqual(document.warnings, []);
    // One request per sentence, each holding that sentence alone.
    assert.deepEqual(
        calls.map((call) => call.state.sentence).sort(),
        candidatesOf(TEXT)
            .map((candidate) => candidate.text)
            .sort(),
    );
    assert.ok(calls.every((call) => call.model === MODEL));
    // The refusal is logged with every Noul and without its text.
    assert.equal(logged.length, 1);
    assert.deepEqual(JSON.parse(logged[0]), {
        severity: 'WARNING',
        message: 'library_evergreen_not_evergreen',
        publishKey: SUBJECT.publishKey,
        pointer: '/content',
        start,
        end: CONTENT.length,
        kind: 'ranking',
        rule: 'nouls',
        nouls: { value: 0.05, ranking: 0.9, change: 0.05, period: 0.05, stale: 0.96 },
    });
    assert.ok(!logged.some((line) => line.includes('Norway')));
});

test('a doubtful sentence passes with a warning, logged without its text', async () => {
    const { client } = standIn({ verdicts: { 'Norway gives the most.': [0.5, 'period'] } });
    const checked = await evergreenCheck(TEXT, SUBJECT, { client });
    const start = CONTENT.indexOf('Norway');

    assert.deepEqual(checked, {
        warnings: [
            {
                pointer: '/content',
                start,
                end: CONTENT.length,
                quote: CONTENT.slice(start),
                kind: 'recency',
            },
        ],
    });
    assert.equal(logged.length, 1);
    assert.deepEqual(
        [
            JSON.parse(logged[0]).message,
            JSON.parse(logged[0]).publishKey,
            JSON.parse(logged[0]).noul,
        ],
        ['library_evergreen_doubt', SUBJECT.publishKey, 0.5],
    );
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
            ['not found', [{ status: 404 }], 1, 'http'],
            ['unprocessable', [{ status: 422 }], 1, 'http'],
            ['timeout', [{ hang: true }, { timeout: 20 }], 1, 'timeout'],
            ['unanswered question', [{ drop: 'period' }], 1, 'unanswered'],
            ['another model', [{ model: 'jev-1.13.0' }], 1, 'model'],
        ];

        for (const [name, args, sent, cause] of cases) {
            logged = [];

            const { calls, client } = standIn(...args);
            const { response, document } = await refusalOf(
                await evergreenCheck(ONE, SUBJECT, { client }),
            );

            assert.equal(response.status, 503, name);
            assert.equal(response.headers.get('Retry-After'), '5', name);
            assert.equal(response.headers.get('Cache-Control'), 'no-store', name);
            assert.equal(document.code, 'evergreen_check_unavailable', name);
            assert.equal(calls.length, sent, name);
            assert.equal(logged.length, 1, name);
            assert.deepEqual(
                [
                    JSON.parse(logged[0]).message,
                    JSON.parse(logged[0]).cause,
                    JSON.parse(logged[0]).publishKey,
                ],
                ['library_evergreen_unavailable', cause, SUBJECT.publishKey],
                name,
            );
            assert.ok(!logged[0].includes('Norway') && !logged[0].includes('stand-in'), name);
        }
    },
);

test('a check past its deadline answers 503 even when a request answers after it', async () => {
    const { config } = standIn({ verdicts: {} });

    // A client that answers whatever cancels the request, as one whose answer
    // arrives as the deadline passes does.
    class Deaf extends TypeSafeClient {
        override systemOne<const Q extends Questions>(request: SystemOneRequest<Q>) {
            return super.systemOne(request);
        }
    }

    const content = Array.from(
        { length: REQUEST_CONCURRENCY + 1 },
        (_, n) => `Row ${n + 1} reads one donor's figure.`,
    ).join('\n');
    const deaf = () => new Deaf(config);
    const { response, document } = await refusalOf(
        await evergreenCheck({ content }, SUBJECT, { client: deaf, deadline: 0 }),
    );

    assert.equal(response.status, 503);
    assert.equal(document.code, 'evergreen_check_unavailable');
    assert.equal(JSON.parse(logged[0]).cause, 'timeout');
});

test('a request TypeSafe refuses for its content answers 502 with no retry', async () => {
    for (const status of [400, 413]) {
        logged = [];

        const { calls, client } = standIn({ status });
        const { response, document } = await refusalOf(
            await evergreenCheck(ONE, { artifact: 'a1' }, { client }),
        );

        assert.equal(response.status, 502, String(status));
        assert.equal(response.headers.get('Retry-After'), null, String(status));
        assert.equal(document.code, 'evergreen_check_refused', String(status));
        assert.equal(calls.length, 1, String(status));
        assert.deepEqual(
            [JSON.parse(logged[0]).message, JSON.parse(logged[0]).artifact],
            ['library_evergreen_refused', 'a1'],
        );
    }
});

test('a text near the length limit is asked about one sentence per request, in parallel', async () => {
    const lines: string[] = [];

    for (let n = 1; [...lines, 'x'].join('\n').length < LIMITS.content - 60; n += 1) {
        lines.push(`Row ${n} of the table reads one donor's figure for the year shown.`);
    }

    const content = lines.join('\n');
    const last = lines.at(-1) ?? '';
    const { calls, flight, client } = standIn({ verdicts: { [last]: [0.9, 'value'] } });
    const { document } = await refusalOf(await evergreenCheck({ content }, SUBJECT, { client }));

    assert.ok(content.length > LIMITS.content - 100 && content.length <= LIMITS.content);
    assert.equal(calls.length, candidatesOf({ content }).length);
    assert.ok(flight.peak > 1 && flight.peak <= REQUEST_CONCURRENCY, String(flight.peak));
    assert.deepEqual(
        (document.errors as { start: number; end: number }[]).map(({ start, end }) =>
            content.slice(start, end),
        ),
        [last],
    );
});

test('without an API key the check answers 503, logs the missing key and reads no card', async () => {
    let asked = 0;
    const periods = async () => {
        asked += 1;

        return 'fixed' as const;
    };
    const { response, document } = await refusalOf(
        await evergreenCheck({ ...TEXT, title: 'ODA by donor, 2023' }, SUBJECT, { periods }),
    );

    assert.equal(asked, 0);

    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Retry-After'), '5');
    assert.equal(document.code, 'evergreen_check_unavailable');
    assert.deepEqual(
        logged.map((line) => [JSON.parse(line).message, JSON.parse(line).cause]),
        [['library_evergreen_unavailable', 'missing_key']],
    );
});

test("no text and a snapshot's text skip the call", async () => {
    const { calls, client } = standIn({ status: 500 });

    assert.deepEqual(await evergreenCheck({ content: null }, SUBJECT, { client }), {
        warnings: [],
    });
    assert.deepEqual(await evergreenCheck(TEXT, SUBJECT, { client, mode: 'snapshot' }), {
        warnings: [],
    });
    assert.equal(calls.length, 0);
    assert.equal(logged.length, 0);
});

test('a text of more than MAX_CANDIDATES sentences is refused at its field before any call', async () => {
    const lines = (count: number) =>
        Array.from({ length: count }, (_, n) => `Line ${n + 1} names a donor.`).join('\n');
    const title = 'ODA by donor';
    const within = standIn({});

    // The title is one sentence, so the content holds the rest.
    assert.deepEqual(
        await evergreenCheck({ title, content: lines(MAX_CANDIDATES - 1) }, SUBJECT, {
            client: within.client,
        }),
        { warnings: [] },
    );
    assert.equal(within.calls.length, MAX_CANDIDATES);

    const over = standIn({});
    const { response, document } = await refusalOf(
        await evergreenCheck({ title, content: lines(MAX_CANDIDATES) }, SUBJECT, {
            client: over.client,
        }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(
        [document.code, document.pointer, document.limit],
        ['evergreen_too_long', '/content', MAX_CANDIDATES],
    );
    assert.equal(over.calls.length, 0);
});

test('the year rules spare a title only when every data card is known to draw fixed periods', async () => {
    const title = 'Health expenditure per capita in Kenya, Liberia, and Niger, 2023';
    const never = new Promise<PeriodsFound>(() => {});
    // Each lookup, the refusal code or null for a pass, and the cause logged.
    const cases: [
        string,
        ((signal: AbortSignal) => Promise<PeriodsFound>) | undefined,
        string | null,
        string | null,
    ][] = [
        ['fixed', async () => 'fixed', null, null],
        ['rolling', async () => 'rolling', 'not_evergreen', null],
        ['no lookup', undefined, 'not_evergreen', null],
        ['a read with no mode', async () => 'mode_missing', 'not_evergreen', 'mode_missing'],
        ['a card with no revision', async () => 'no_revision', 'not_evergreen', 'no_revision'],
        ['a failed read', () => Promise.reject(new Error('down')), 'not_evergreen', 'client'],
        ['a read past its deadline', () => never, 'not_evergreen', 'timeout'],
    ];

    for (const [name, periods, code, cause] of cases) {
        logged = [];

        const { client } = standIn({});
        const checked = await evergreenCheck({ title }, SUBJECT, {
            client,
            deadline: 50,
            periods,
        });

        const unknown = logged
            .map((line) => JSON.parse(line))
            .filter((line) => line.message === 'library_period_mode_unknown');

        assert.deepEqual(
            unknown.map((line) => line.cause),
            cause ? [cause] : [],
            name,
        );

        if (code === null) {
            assert.deepEqual(checked, { warnings: [] }, name);
            continue;
        }

        const { document } = await refusalOf(checked);

        assert.deepEqual([document.code, document.pointer], [code, '/title'], name);
    }
});

test('a year in a description alone asks the lookup, and fixed periods pass its period claim', async () => {
    const description = 'Per person health expenditure in Kenya, Liberia, and Niger for 2023';
    const { client } = standIn({ verdicts: { [description]: [0.41, 'period'] } });
    const asked: string[] = [];
    const lookup = (found: PeriodsFound) => async () => {
        asked.push(found);

        return found;
    };
    const fixed = await evergreenCheck(
        { title: 'Health expenditure per capita', description },
        SUBJECT,
        {
            client,
            periods: lookup('fixed'),
        },
    );
    const rolling = await evergreenCheck(
        { title: 'Health expenditure per capita', description },
        SUBJECT,
        {
            client,
            periods: lookup('rolling'),
        },
    );

    assert.deepEqual(asked, ['fixed', 'rolling']);
    assert.deepEqual(fixed, { warnings: [] });
    assert.ok('warnings' in rolling);
    assert.deepEqual(
        rolling.warnings.map(({ pointer, kind }) => [pointer, kind]),
        [['/description', 'recency']],
    );
});

test('fixed periods leave the per-sentence judgment in place, and a text naming no year skips the lookup', async () => {
    const title = 'Health expenditure per capita in Kenya, 2023';
    const { client } = standIn({ verdicts: { [title]: [0.95, 'value'] } });
    const { document } = await refusalOf(
        await evergreenCheck({ title }, SUBJECT, { client, periods: async () => 'fixed' }),
    );

    assert.deepEqual([document.code, document.pointer], ['not_evergreen', '/title']);

    let asked = 0;

    await evergreenCheck(TEXT, SUBJECT, {
        client: standIn({}).client,
        periods: async () => {
            asked += 1;

            return 'fixed';
        },
    });
    assert.equal(asked, 0);
});
