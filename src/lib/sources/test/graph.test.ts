import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadSourceDoc,
    loadSources,
    toCard,
    type SourceCatalogueEntry,
    type SourceDataset,
} from '../graph.ts';

// graph.ts reads its API origin at call time; every fetch below is mocked.
process.env.SEARCH_API_BASE = 'https://apis.example.org';

const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

const IDS: SourceDataset = {
    ref: 'dc/d/WorldBank_InternationalDebtStatistics',
    label: 'World Bank International Debt Statistics (IDS)',
    description: 'External debt stocks and flows for low- and middle-income countries.',
    license_type: 'CC BY 4.0',
    update_cadence: 'Annual',
    years_covered: '1970-2023',
    source_url: 'https://datatopics.worldbank.org/debt/ids/',
    provenances: [
        {
            ref: 'provenance/WorldBankInternationalDebtStatistics',
            label: 'World Bank International Debt Statistics',
        },
    ],
};

const WDI: SourceDataset = {
    ref: 'dc/d/WorldBank_WorldDevelopmentIndicators',
    label: 'World Development Indicators',
    description: null,
    license_type: null,
    update_cadence: null,
    years_covered: null,
    source_url: null,
    provenances: [{ ref: 'dc/base/WorldBank_WDI', label: 'WorldBank_WDI' }],
};

const WORLD_BANK: SourceCatalogueEntry = {
    source: { ref: 'dc/s/WorldBank', label: 'World Bank' },
    data_commons: { id: 'dfo', label: 'Development Finance Observatory' },
    datasets: [IDS, WDI],
    exclusions: [],
};

// A UN agency provenance is its own Source and Dataset, and the catalogue
// carries no card facts for it.
const WFP_OWN: SourceDataset = {
    ref: 'un/wfp',
    label: 'World Food Programme',
    description: null,
    license_type: null,
    update_cadence: null,
    years_covered: null,
    source_url: null,
    provenances: [{ ref: 'un/wfp', label: 'World Food Programme' }],
};

const WFP: SourceCatalogueEntry = {
    source: { ref: 'un/wfp', label: 'World Food Programme' },
    data_commons: { id: 'un_system', label: 'UN System Data Commons' },
    datasets: [WFP_OWN],
    exclusions: [],
};

test('toCard takes the facts from the Dataset row and the publisher and origin from its entry', () => {
    assert.deepEqual(toCard(WORLD_BANK, IDS), {
        id: 'dc/d/WorldBank_InternationalDebtStatistics',
        title: 'World Bank International Debt Statistics (IDS)',
        family: 'dc/s/WorldBank',
        publisher: 'World Bank',
        dataCommons: { id: 'dfo', label: 'Development Finance Observatory' },
        origin: 'World Bank',
        description: 'External debt stocks and flows for low- and middle-income countries.',
        chips: [
            { kind: 'licence', label: 'CC BY 4.0' },
            { kind: 'currency', label: 'Annual' },
            { kind: 'coverage', label: '1970-2023' },
        ],
        href: 'https://datatopics.worldbank.org/debt/ids/',
        tier: 'full',
    });
});

test('toCard omits the chips whose field is empty and keeps the others in order', () => {
    const card = toCard(WORLD_BANK, { ...IDS, license_type: null, years_covered: '2000-2020' });

    assert.deepEqual(card.chips, [
        { kind: 'currency', label: 'Annual' },
        { kind: 'coverage', label: '2000-2020' },
    ]);
});

test('toCard links only an http or https source_url', () => {
    const href = (source_url: string | null) => toCard(WORLD_BANK, { ...IDS, source_url }).href;

    assert.equal(href('http://example.org/x'), 'http://example.org/x');
    assert.equal(href('javascript:alert(1)'), null);
    assert.equal(href('ftp://example.org/x'), null);
    assert.equal(href(''), null);
    assert.equal(href(null), null);
});

test('toCard makes a stub card with no chips or link when the row has no facts', () => {
    const card = toCard(WORLD_BANK, WDI);

    assert.equal(card.tier, 'stub');
    assert.equal(card.family, 'dc/s/WorldBank');
    assert.equal(card.publisher, 'World Bank');
    assert.equal(card.description, null);
    assert.deepEqual(card.chips, []);
    assert.equal(card.href, null);
});

test("toCard credits a UN agency's own Dataset with its origin alone", () => {
    const card = toCard(WFP, WFP_OWN);

    assert.equal(card.origin, 'via UN System Data Commons');
    assert.equal(card.family, 'un/wfp');
    assert.equal(card.tier, 'stub');
    assert.deepEqual(card.chips, []);
});

test('loadSources reads the catalogue once and makes a card per Dataset in its order', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
        json({ sources: [WFP, WORLD_BANK] }),
    );

    const cards = await loadSources();

    assert.equal(fetchMock.mock.callCount(), 1);
    assert.match(String(fetchMock.mock.calls[0].arguments[0]), /\/api\/graph\/sources$/);
    assert.deepEqual(
        cards.map((card) => card.id),
        ['un/wfp', IDS.ref, WDI.ref],
    );
});

// The retry waits RETRY_DELAY_MS on the global setTimeout. Mock timers let a
// test observe the wait, so the second read only happens after the tick.
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('loadSources retries the catalogue once after a 503 or 504, once the delay has passed', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });

    for (const status of [503, 504]) {
        const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
            fetchMock.mock.callCount() === 0
                ? json({ code: 'upstream_unavailable' }, status)
                : json({ sources: [{ ...WORLD_BANK, datasets: [IDS] }] }),
        );

        const pending = loadSources();

        await flush();
        assert.equal(fetchMock.mock.callCount(), 1);
        t.mock.timers.tick(999);
        await flush();
        assert.equal(fetchMock.mock.callCount(), 1);
        t.mock.timers.tick(1);

        const cards = await pending;

        assert.equal(fetchMock.mock.callCount(), 2);
        assert.deepEqual(
            cards.map((card) => card.id),
            [IDS.ref],
        );
        fetchMock.mock.restore();
    }
});

test('loadSources throws after a second 503, having read the catalogue twice', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });

    const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
        json({ code: 'upstream_unavailable' }, 503),
    );
    const pending = assert.rejects(loadSources(), /HTTP 503/);

    await flush();
    t.mock.timers.tick(1000);
    await pending;
    assert.equal(fetchMock.mock.callCount(), 2);
});

test('every graph read carries its own timeout signal, so Next does not dedupe the retry', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });

    const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
        fetchMock.mock.callCount() === 0 ? json({}, 503) : json({ sources: [] }),
    );
    const pending = loadSources();

    await flush();
    t.mock.timers.tick(1000);
    await pending;
    await loadSourceDoc(IDS.ref);

    const signals = fetchMock.mock.calls.map(
        (call) => (call.arguments[1] as RequestInit | undefined)?.signal,
    );

    assert.equal(signals.length, 3);
    for (const signal of signals) {
        assert.ok(signal instanceof AbortSignal);
    }
    assert.notEqual(signals[0], signals[1]);
    assert.deepEqual((fetchMock.mock.calls[0].arguments[1] as { next: unknown }).next, {
        revalidate: 3600,
    });
});

test('loadSources does not retry a 500', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => json({ code: 'boom' }, 500));

    await assert.rejects(loadSources(), /HTTP 500/);
    assert.equal(fetchMock.mock.callCount(), 1);
});

test('loadSourceDoc does not retry a 503', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => json({ code: 'busy' }, 503));

    await assert.rejects(loadSourceDoc(IDS.ref), /HTTP 503/);
    assert.equal(fetchMock.mock.callCount(), 1);
});

test('loadSourceDoc returns null for a dcid the graph does not hold', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => json({ code: 'node_not_held' }, 404));

    assert.equal(await loadSourceDoc('dc/d/Missing'), null);
});

test('loadSourceDoc returns null for a node that is not a source', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => json({ code: 'request_invalid' }, 400));

    assert.equal(await loadSourceDoc('Country/KEN'), null);
});

test('loadSourceDoc throws on a 5xx so the page errors rather than rendering a 404', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => json({ code: 'pool_exhausted' }, 503));

    await assert.rejects(loadSourceDoc(IDS.ref), /HTTP 503/);
});

test('loadSourceDoc throws when the request itself fails', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => {
        throw new TypeError('fetch failed');
    });

    await assert.rejects(loadSourceDoc(IDS.ref), (error: Error) => {
        assert.match(error.message, /failed/);
        assert.ok(error.cause instanceof TypeError);

        return true;
    });
});

test('loadSourceDoc strips a dcid: prefix', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
        json({ details: { name_of_source: 'IDS' }, gaps: [] }),
    );

    const doc = await loadSourceDoc(`dcid:${IDS.ref}`);

    assert.match(
        String(fetchMock.mock.calls[0].arguments[0]),
        /\/api\/graph\/documentation\/dc\/d\/WorldBank_InternationalDebtStatistics$/,
    );
    assert.deepEqual(doc, { details: { name_of_source: 'IDS' }, gaps: [], document_errors: [] });
});

test('loadSourceDoc gives a document that omits document_errors an empty list and keeps a served one', async (t) => {
    const served = [{ member: 'data_notes', line: 3, reason: 'empty_section' }];
    const bodies = [{ gaps: [] }, { gaps: [], document_errors: served }];

    t.mock.method(globalThis, 'fetch', async () => json(bodies.shift()));

    assert.deepEqual((await loadSourceDoc('dc/d/A'))?.document_errors, []);
    assert.deepEqual((await loadSourceDoc('dc/d/B'))?.document_errors, served);
});

test('loadSourceDoc keeps the slashes of a real dcid and encodes each segment', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => json({ gaps: [] }));

    await loadSourceDoc('dc/base/WorldBank_IDS');
    await loadSourceDoc('dc/d/A b&c');

    const urls = fetchMock.mock.calls.map((call) => String(call.arguments[0]));

    assert.match(urls[0] ?? '', /\/api\/graph\/documentation\/dc\/base\/WorldBank_IDS$/);
    assert.match(urls[1] ?? '', /\/api\/graph\/documentation\/dc\/d\/A%20b%26c$/);
});

test('loadSourceDoc refuses a dcid whose segment could redirect the read, without calling the API', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => json({ gaps: [] }));
    const unsafe = [
        '',
        '.',
        '..',
        'dc/../health',
        'dc//x',
        '/dc/x',
        'dc/x/',
        'dc/x?y=1',
        'dc/x#frag',
        'dc/%2E%2E/x',
        'dc\\x',
        'dcid:..',
    ];

    for (const dcid of unsafe) {
        assert.equal(await loadSourceDoc(dcid), null, JSON.stringify(dcid));
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});
