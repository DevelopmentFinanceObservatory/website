import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { TypeSafeClient } from '@typesafe-ai/sdk';

const { CLIENT_CONFIG, MODEL, checkEvergreenKey, evergreenRefusal } =
    await import('../evergreen.ts');
const { REASONS } = await import('../evergreenRule.ts');

type Sent = {
    model: string;
    state: { sentences: { text: string }[] };
    questions: Record<string, { type: string }>;
};

// Jev's answers by sentence: its Noul and the claim kind it names.
type Verdicts = Record<string, [number, string]>;

// A stand-in for TypeSafe's API that answers every question it is sent from
// `verdicts`, or answers with `status`, or never answers. `calls` counts
// the requests it was sent.
const standIn = (
    reply: { verdicts?: Verdicts; status?: number; hang?: true; drop?: string },
    overrides: Partial<ConstructorParameters<typeof TypeSafeClient>[0]> = {},
) => {
    const calls: Sent[] = [];
    const fetch = async (_url: string, init?: RequestInit): Promise<Response> => {
        const sent = JSON.parse(String(init?.body)) as Sent;

        calls.push(sent);

        if (reply.hang) {
            return new Promise((_, reject) =>
                init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)),
            );
        }

        if (reply.status) {
            return Response.json({ detail: 'stand-in' }, { status: reply.status });
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

        return Response.json({ model: sent.model, answers, usage: {} });
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

    return { calls, client };
};

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
    const response = await evergreenRefusal(TEXT, client);

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

    assert.equal(await evergreenRefusal(TEXT, client), null);
    assert.equal(logged.length, 1);
    assert.equal(JSON.parse(logged[0]).message, 'library_evergreen_doubt');
    assert.ok(!logged[0].includes('Norway'));
});

test('the check answers 503 when TypeSafe cannot answer, and logs no text', async () => {
    const cases: [string, Parameters<typeof standIn>, number][] = [
        ['rate limited', [{ status: 429 }], 2],
        ['server error', [{ status: 500 }], 2],
        ['bad key', [{ status: 401 }], 1],
        ['timeout', [{ hang: true }, { timeout: 20 }], 1],
        ['unanswered question', [{ drop: 'kind_3' }], 1],
    ];

    for (const [name, args, sent] of cases) {
        logged = [];

        const { calls, client } = standIn(...args);
        const response = await evergreenRefusal(TEXT, client);

        assert.equal(response?.status, 503, name);
        assert.equal(response?.headers.get('Retry-After'), '5', name);
        assert.equal(response?.headers.get('Cache-Control'), 'no-store', name);
        assert.equal((await body(response)).code, 'evergreen_check_unavailable', name);
        assert.equal(calls.length, sent, name);
        assert.equal(logged.length, 1, name);
        assert.ok(!logged[0].includes('Norway') && !logged[0].includes('stand-in'), name);
    }
});

test('without an API key the check answers 503', async () => {
    const response = await evergreenRefusal(TEXT, () => new TypeSafeClient({ ...CLIENT_CONFIG }));

    assert.equal(response?.status, 503);
    assert.equal((await body(response)).code, 'evergreen_check_unavailable');
});

test('the switch turned off, or no text, skips the call', async () => {
    const { calls, client } = standIn({ status: 500 });

    assert.equal(await evergreenRefusal({ content: null }, client), null);
    assert.equal(logged.length, 0);

    process.env.LIBRARY_EVERGREEN_CHECK = ' OFF ';

    assert.equal(await evergreenRefusal(TEXT, client), null);
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
