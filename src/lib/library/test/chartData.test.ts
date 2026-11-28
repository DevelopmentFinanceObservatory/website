import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

// Before chartData.ts, which loads next/cache.
import { nextCache } from '../../test/nextCacheStub.ts';
import { SharesError, type SharesBackend } from '../../chat/apisShares.ts';
import { DATASET_FRAME, MOVED_FRAME, slotRead } from '../../studio/test/fixtures/component-read.ts';
import describedChart from '../../studio/test/fixtures/descriptions/envelope-line-chart-described.json' with { type: 'json' };
import {
    libraryChartData,
    libraryCsvResponse,
    readFailureResponse,
    recentRows,
    withRowBudget,
} from '../chartData.ts';

const artifact = {
    slug: 'health-expenditure',
    shareId: 'Ab3dEf7h',
    title: 'Health expenditure per capita',
    description: 'Health expenditure per person across three countries.',
    sources: [{ name: 'World Development Indicators', url: '/data/sources/wdi' }],
};
const ORIGIN = 'https://developmentfinance.org';
const CSV = '/library/health-expenditure/data.csv';
type Frame = { spec_id: string; content_version: string };

// The page's CSV link, pinned to the frame its rows are drawn on.
const pinned = (frame: Frame, query: Record<string, string> = {}) =>
    `${CSV}?${new URLSearchParams({ ...query, ...frame })}`;

// The CSV route's arguments for a link of the page.
const csvQuery = (href: string) => {
    const query = new URL(href, ORIGIN).searchParams;
    const specId = query.get('spec_id');
    const contentVersion = query.get('content_version');

    return {
        card: query.get('card'),
        frame:
            specId && contentVersion ? { spec_id: specId, content_version: contentVersion } : null,
    };
};
const countries = [
    { ref: 'country/KEN', label: 'Kenya', value: 91.127 },
    { ref: 'country/LBR', label: 'Liberia', value: 0 },
    { ref: 'country/NER', label: 'Niger', value: 649.3679 },
];

const barChart = (period: string) => ({
    ...describedChart.component,
    type: 'bar_chart',
    category_axis: { mode: 'entity', category_dimension: 'country', period },
    series: countries.map(({ label, value }) => ({
        label,
        unit: 'USD',
        points: [
            { period, value },
            { period: '2022', value: 99 },
        ],
    })),
});

// The same values as a Studio table: one row per country, in its columns.
const countryTable = (period: string) => ({
    type: 'table',
    title: describedChart.component.title,
    columns: [
        { key: 'country', label: 'Country' },
        { key: 'period', label: 'Year' },
        { key: 'value', label: 'Value' },
    ],
    rows: countries.map(({ label, value }) => ({
        series_id: 's_health',
        dimensions: { country: label },
        period,
        unit: 'USD',
        value,
    })),
});

const slotBody = (
    period: string,
    licence: string,
    component: Record<string, unknown> = barChart(period),
    frame: Frame | null = DATASET_FRAME,
) => {
    const body = slotRead('cmp_test', 2, DATASET_FRAME, frame);

    return {
        ...body,
        resolved_payload: {
            ...body.resolved_payload,
            component,
            description: {
                ...describedChart.description,
                about: {
                    measure: { label: 'current health expenditure per capita', definition: null },
                    drawn: {
                        dimensions: [
                            {
                                property: { ref: 'observationAbout', label: 'country' },
                                count: 3,
                                of: 3,
                                values: countries,
                            },
                        ],
                    },
                },
                sources: [
                    {
                        ref: 'provenance/WorldDevelopmentIndicators',
                        label: 'World Development Indicators',
                        licence,
                    },
                ],
            },
        },
    };
};

type Card = { kind: 'chart' | 'table'; view?: string };

type Shape = {
    kind: 'card' | 'canvas';
    slots: number[];
    widgets: Record<string, unknown>[];
    extra?: Record<string, unknown>;
};

// The frame a slot route's query names, or null.
const frameOfQuery = (query: URLSearchParams): Frame | null => {
    const specId = query.get('spec_id');
    const contentVersion = query.get('content_version');

    return specId && contentVersion ? { spec_id: specId, content_version: contentVersion } : null;
};

// What the slot data route exports: the slot and frame it was asked for.
const exported = (n: number, frame: Frame | null) =>
    new Response(
        `slot ${n} on ${frame ? `${frame.spec_id}@${frame.content_version}` : 'none'}\r\n`,
        {
            headers: { 'content-type': 'text/csv' },
        },
    );

// A share of `shape` whose slot `n` answers `slot(n, frame)`, `frame` the
// one a read names, and whose slot data route answers `file(n, frame)`.
const shareBackend = (
    mode: 'live' | 'snapshot',
    { kind, slots, widgets, extra = {} }: Shape,
    slot: (n: number, frame: Frame | null) => Response | Promise<Response>,
    file: (n: number, frame: Frame | null) => Response = exported,
): SharesBackend => ({
    base: 'https://apis.example',
    nameCaller: () => {},
    fetch: async (input) => {
        const url = new URL(String(input));
        const path = url.pathname;

        if (path === '/api/presentation/shares/Ab3dEf7h') {
            return Response.json({
                id: artifact.shareId,
                kind,
                mode,
                title: artifact.title,
                slots: slots.map((n) => ({
                    slot: n,
                    card: { component_id: 'cmp_test', revision: 2, frame: DATASET_FRAME },
                })),
                payload: { widgets, ...extra },
                created_at: '2026-11-28T00:00:00Z',
            });
        }

        const [, n, data] =
            /^\/api\/presentation\/shares\/Ab3dEf7h\/slots\/(\d+)(\/data)?$/.exec(path) ?? [];

        assert.ok(n, path);

        if (data) {
            assert.deepEqual(
                [url.searchParams.get('format'), url.searchParams.get('bundle')],
                ['csv', 'false'],
            );

            return file(Number(n), frameOfQuery(url.searchParams));
        }

        return slot(Number(n), frameOfQuery(url.searchParams));
    },
});

// A card share whose one card reads slot 2.
const backend = (
    mode: 'live' | 'snapshot',
    slot: (frame: Frame | null) => Response | Promise<Response>,
    card: Card = { kind: 'chart' },
    file?: (n: number, frame: Frame | null) => Response,
): SharesBackend =>
    shareBackend(
        mode,
        {
            kind: 'card',
            slots: [2],
            widgets: [{ id: 'health', kind: card.kind, turn: 1, slot: 1 }],
            extra: card.view ? { views: { health: card.view } } : {},
        },
        (_n, frame) => slot(frame),
        file,
    );

beforeEach(nextCache.clear);

test('a pinned country chart publishes only its plotted year, exact values and its slot CSV', async () => {
    const licence = 'https://creativecommons.org/licenses/by/4.0/';
    const body = slotBody('2023', licence);

    body.resolved_payload.description.freshness = {
        ...body.resolved_payload.description.freshness,
        prepared: '2026-11-20',
    };

    const [data] = await libraryChartData(
        backend('snapshot', () => Response.json(body)),
        artifact,
        ORIGIN,
    );

    assert.ok(data);
    assert.deepEqual(
        data.rows,
        countries.map(({ label, value }) => ({
            series: label,
            period: '2023',
            value,
            unit: 'USD',
        })),
    );
    assert.deepEqual([data.seriesHeading, data.periodHeading], ['Country', 'Year']);
    assert.equal(data.dataset.temporalCoverage, '2023');
    assert.equal(data.dataset.variableMeasured, 'current health expenditure per capita');
    assert.deepEqual(data.dataset.isBasedOn, [
        {
            '@type': 'Dataset',
            name: 'World Development Indicators',
            url: `${ORIGIN}/data/sources/wdi`,
            license: licence,
        },
    ]);
    assert.equal(data.dataset.license, licence);
    assert.equal(data.csvHref, pinned(DATASET_FRAME));
    const observatory = {
        '@type': 'Organization',
        name: 'Development Finance Observatory',
        url: 'https://developmentfinance.org',
    };

    assert.deepEqual(
        {
            creator: data.dataset.creator,
            publisher: data.dataset.publisher,
            isAccessibleForFree: data.dataset.isAccessibleForFree,
            dateModified: data.dataset.dateModified,
            includedInDataCatalog: data.dataset.includedInDataCatalog,
        },
        {
            creator: observatory,
            publisher: observatory,
            isAccessibleForFree: true,
            dateModified: '2026-11-20',
            includedInDataCatalog: {
                '@type': 'DataCatalog',
                name: 'Development Finance Observatory Library',
                url: `${ORIGIN}/library`,
            },
        },
    );
    assert.deepEqual(data.dataset.distribution, {
        '@type': 'DataDownload',
        encodingFormat: 'text/csv',
        contentUrl: `${ORIGIN}${pinned(DATASET_FRAME)}`,
    });
    assert.equal(data.label, null);
});

test('a live chart reports the served period and leaves an unknown licence out', async () => {
    const [data] = await libraryChartData(
        backend('live', () => Response.json(slotBody('2025-Q2', 'unknown'))),
        artifact,
        ORIGIN,
    );

    assert.ok(data);
    assert.deepEqual(data.window, { start: '2025-Q2', end: '2025-Q2' });
    assert.deepEqual(
        [data.periodHeading, data.dataset.temporalCoverage],
        ['Period', '2025-04/2025-06'],
    );
    assert.equal(data.dataset.license, undefined);
    assert.equal(data.dataset.isBasedOn?.[0].license, undefined);
});

for (const [label, answer, retryable, readsAfterTwo] of [
    ['a slot dfo-apis no longer has is kept as no data', 404, false, 1],
    ['a frame dfo-apis marks retryable is read again', 404, true, 2],
    ['a slot dfo-apis cannot serve for now is read again', 503, false, 2],
] as const) {
    test(label, async () => {
        let reads = 0;
        const shares = backend('live', () => {
            reads += 1;

            return Response.json({ code: 'frame_unavailable', retryable }, { status: answer });
        });

        assert.deepEqual(await libraryChartData(shares, artifact, ORIGIN), []);
        assert.deepEqual(await libraryChartData(shares, artifact, ORIGIN), []);
        assert.equal(reads, readsAfterTwo);
    });
}

test('a retryable refusal leaves the last good rows in the cache', async () => {
    let answer = (): Response => Response.json(slotBody('2023', 'unknown'));
    const shares = backend('live', () => answer());

    await libraryChartData(shares, artifact, ORIGIN);
    nextCache.expire();
    answer = () => Response.json({ code: 'frame_unavailable', retryable: true }, { status: 404 });

    assert.deepEqual(await libraryChartData(shares, artifact, ORIGIN), []);

    const current = [...nextCache.stored].filter(([key]) => key.includes('library-slot-current'));

    assert.equal(current.length, 1);
    assert.deepEqual(JSON.parse(current[0][1].data.body).chart.rows, plotted);

    answer = () => Response.json(slotBody('2024', 'unknown'));

    const [recovered] = await libraryChartData(shares, artifact, ORIGIN);

    assert.deepEqual(
        recovered?.rows.map(({ period }) => period),
        ['2024', '2024', '2024'],
    );
});

test('the pinned CSV serves the frame the page showed from any server after the slot moves on', async () => {
    let moved = false;
    const reads: (Frame | null)[] = [];
    const shares = backend('live', (frame) => {
        reads.push(frame);

        if (frame) {
            return Response.json(slotBody('2023', 'unknown', barChart('2023'), frame));
        }

        return Response.json(
            moved
                ? slotBody('2024', 'unknown', barChart('2024'), MOVED_FRAME)
                : slotBody('2023', 'unknown'),
        );
    });
    const [page] = await libraryChartData(shares, artifact, ORIGIN);
    const csv = (href: string) =>
        libraryCsvResponse(shares, artifact, { ...csvQuery(href), open: true });

    assert.ok(page);
    assert.equal(page.csvHref, pinned(DATASET_FRAME));
    assert.equal(page.dataset.distribution.contentUrl, `${ORIGIN}${page.csvHref}`);
    assert.equal(page.dataset.dateModified, undefined);

    // Another server, whose cache holds nothing, after the slot moved on.
    moved = true;
    nextCache.clear();
    reads.length = 0;

    const response = await csv(page.csvHref);

    assert.equal(response.status, 200);
    assert.deepEqual(
        [
            response.headers.get('content-type'),
            response.headers.get('cache-control'),
            response.headers.get('link'),
        ],
        [
            'text/csv; charset=utf-8',
            'public, max-age=300, must-revalidate',
            `<${ORIGIN}/library/health-expenditure>; rel="cite-as"`,
        ],
    );
    assert.equal(
        await response.text(),
        `slot 2 on ${DATASET_FRAME.spec_id}@${DATASET_FRAME.content_version}\r\n`,
    );
    assert.deepEqual(reads, [DATASET_FRAME]);

    // The frame entry the pinned read filled serves the next request.
    await (await csv(page.csvHref)).text();
    assert.deepEqual(reads, [DATASET_FRAME]);

    // The unpinned address reads the file on the frame the slot serves now.
    const current = await csv(CSV);

    assert.equal(await current.text(), 'slot 2 on none\r\n');
});

for (const [label, refusal, expected] of [
    ['a frame the slot never served answers 404', 404, 'frame_not_served'],
    ['a frame DFO no longer holds answers 410', 410, 'frame_expired'],
] as const) {
    test(`the pinned CSV: ${label}`, async () => {
        let refused = 0;
        const shares = backend('live', (frame) => {
            if (frame) {
                refused += 1;

                return Response.json({ code: expected, retryable: false }, { status: refusal });
            }

            return Response.json(slotBody('2024', 'unknown', barChart('2024'), MOVED_FRAME));
        });
        const csv = () =>
            libraryCsvResponse(shares, artifact, { card: null, frame: DATASET_FRAME, open: true });
        const response = await csv();

        await csv();
        assert.deepEqual(
            [response.status, (await response.json()).code, refused],
            [refusal, expected, 2],
        );
    });
}

const csvFile = () => Response.json(slotBody('2023', 'unknown'));

for (const [label, slot, file, expected] of [
    [
        'a rate-limited card read answers 429 with its wait, and is read again',
        () =>
            new Response(JSON.stringify({ code: 'rate_limited', retryable: true }), {
                status: 429,
                headers: { 'retry-after': '30' },
            }),
        exported,
        { status: 429, code: 'rate_limited', retryAfter: '30', reads: 2 },
    ],
    [
        'a card dfo-apis cannot draw answers 422, and is kept',
        () => Response.json({ code: 'constraint_violation' }, { status: 422 }),
        exported,
        { status: 422, code: 'constraint_violation', retryAfter: null, reads: 1 },
    ],
    [
        'a slot dfo-apis has taken away answers 410, and is kept',
        () => Response.json({ code: 'gone' }, { status: 410 }),
        exported,
        { status: 410, code: 'gone', retryAfter: null, reads: 1 },
    ],
    [
        "a slot answer outside dfo-apis' shape answers 404, and is kept",
        () => Response.json({ not: 'a card' }),
        exported,
        { status: 404, code: 'not_found', retryAfter: null, reads: 1 },
    ],
    [
        'a card whose view draws no rows answers 404',
        () => Response.json(slotBody('2023', 'unknown', keyNumber('2023'))),
        exported,
        { status: 404, code: 'not_found', retryAfter: null, reads: 1 },
    ],
    [
        'a rate-limited export answers 429 with its wait',
        csvFile,
        () =>
            new Response(JSON.stringify({ code: 'rate_limited', retryable: true }), {
                status: 429,
                headers: { 'retry-after': '12' },
            }),
        { status: 429, code: 'rate_limited', retryAfter: '12', reads: 1 },
    ],
    [
        'an export dfo-apis cannot draw answers 422',
        csvFile,
        () => Response.json({ code: 'constraint_violation' }, { status: 422 }),
        { status: 422, code: 'constraint_violation', retryAfter: null, reads: 1 },
    ],
    [
        'an export cut off before its end answers 502',
        csvFile,
        () =>
            new Response(
                new ReadableStream({
                    start: (controller) => {
                        controller.enqueue(new TextEncoder().encode('Country,Year\r\n'));
                        controller.error(new Error('connection reset'));
                    },
                }),
            ),
        { status: 502, code: 'backend_unreachable', retryAfter: null, reads: 1 },
    ],
] as const) {
    test(`the CSV route: ${label}`, async () => {
        let reads = 0;
        const shares = backend(
            'snapshot',
            () => {
                reads += 1;

                return slot();
            },
            undefined,
            file,
        );
        const csv = () =>
            libraryCsvResponse(shares, artifact, { card: null, frame: null, open: true });
        const response = await csv();

        await csv();
        assert.deepEqual(
            {
                status: response.status,
                code: (await response.json()).code,
                retryAfter: response.headers.get('retry-after'),
                reads,
            },
            expected,
        );
    });
}

test('a canvas serves each card it shows, under its own name and CSV address', async () => {
    const reads: number[] = [];
    const shares = shareBackend(
        'snapshot',
        {
            kind: 'canvas',
            slots: [1, 2, 3],
            widgets: [
                { id: 'spend', kind: 'chart', turn: 1, slot: 0 },
                { id: 'note', kind: 'text', turn: 1, title: 'Why', body: 'Words' },
                { id: 'rows', kind: 'table', turn: 1, slot: 1 },
                { id: 'gone', kind: 'chart', turn: 1, slot: 2 },
            ],
            extra: {
                removedIds: ['gone'],
                titles: { spend: 'Spending as a chart' },
            },
        },
        (n) => {
            reads.push(n);

            return Response.json(
                slotBody(
                    '2023',
                    'unknown',
                    n === 1 ? barChart('2023') : { ...countryTable('2022'), title: '' },
                ),
            );
        },
    );
    const data = await libraryChartData(shares, artifact, ORIGIN);

    assert.deepEqual(
        data.map(({ id, label, dataset, csvHref }) => [
            id,
            label,
            dataset.name,
            csvHref,
            dataset.temporalCoverage,
            dataset.dateModified,
        ]),
        [
            [
                'spend',
                'Spending as a chart',
                'Spending as a chart',
                pinned(DATASET_FRAME, { card: 'spend' }),
                '2023',
                '2026-11-28T00:00:00Z',
            ],
            [
                'rows',
                'Health expenditure per capita, chart 2',
                'Health expenditure per capita, chart 2',
                pinned(DATASET_FRAME, { card: 'rows' }),
                '2022',
                '2026-11-28T00:00:00Z',
            ],
        ],
    );
    assert.ok(data.every(({ dataset }) => dataset.description !== artifact.description));
    assert.deepEqual(reads.toSorted(), [1, 2]);

    const csv = async (card: string | null) => {
        const response = await libraryCsvResponse(shares, artifact, {
            card,
            frame: null,
            open: false,
        });

        return [response.status, (await response.text()).split(' on ')[0]];
    };

    assert.deepEqual(
        [await csv('rows'), await csv(null), (await csv('gone'))[0]],
        [[200, 'slot 2'], [200, 'slot 1'], 404],
    );
});

test('a canvas card whose read fails leaves the other cards their tables', async () => {
    let failing = true;
    const shares = shareBackend(
        'live',
        {
            kind: 'canvas',
            slots: [1, 2],
            widgets: [
                { id: 'spend', kind: 'chart', turn: 1, slot: 0 },
                { id: 'rows', kind: 'table', turn: 1, slot: 1 },
            ],
            extra: { titles: { rows: 'Spending by country' } },
        },
        (n) =>
            n === 1 && failing
                ? Response.json({ code: 'frame_unavailable', retryable: true }, { status: 404 })
                : Response.json(
                      slotBody(
                          '2023',
                          'unknown',
                          n === 1 ? barChart('2023') : countryTable('2022'),
                      ),
                  ),
    );

    assert.deepEqual(
        (await libraryChartData(shares, artifact, ORIGIN)).map(({ id, label }) => [id, label]),
        [['rows', 'Spending by country']],
    );

    // A CSV that names no card passes over the failing card.
    const first = await libraryCsvResponse(shares, artifact, {
        card: null,
        frame: null,
        open: true,
    });

    assert.deepEqual([first.status, await first.text()], [200, 'slot 2 on none\r\n']);

    failing = false;

    assert.deepEqual(
        (await libraryChartData(shares, artifact, ORIGIN)).map(({ id }) => id),
        ['spend', 'rows'],
    );
});

test("a canvas of one chart keeps the chart's own name and card address", async () => {
    const [data, ...rest] = await libraryChartData(
        shareBackend(
            'live',
            {
                kind: 'canvas',
                slots: [1],
                widgets: [{ id: 'spend', kind: 'chart', turn: 1, slot: 0 }],
                extra: { titles: { spend: 'Spending as a chart' } },
            },
            () => Response.json(slotBody('2023', 'unknown')),
        ),
        artifact,
        ORIGIN,
    );

    assert.deepEqual(rest, []);
    assert.deepEqual(
        [data?.label, data?.dataset.name, data?.dataset.distribution.contentUrl],
        [null, 'Spending as a chart', `${ORIGIN}${pinned(DATASET_FRAME, { card: 'spend' })}`],
    );
});

test('the CSV route answers a failed read under the status it calls for', () => {
    const answers = [
        new SharesError('not_found', { status: 404 }),
        new SharesError('request_invalid', { status: 400 }),
        new SharesError('unprocessable', { status: 422 }),
        new SharesError('frame_expired', { status: 410 }),
        new SharesError('rate_limited', { status: 429, retryable: true, retryAfterS: 30 }),
        new SharesError('upstream_error', { status: 500 }),
        new SharesError('backend_unreachable', { retryable: true }),
    ].map((error) => {
        const response = readFailureResponse(error);

        return [response.status, response.headers.get('retry-after')];
    });

    assert.deepEqual(answers, [
        [404, null],
        [400, null],
        [422, null],
        [410, null],
        [429, '30'],
        [502, null],
        [502, null],
    ]);
});

const plotted = countries.map(({ label, value }) => ({
    series: label,
    period: '2023',
    value,
    unit: 'USD',
}));

// A key number of the same measure: a card that draws no rows.
const keyNumber = (period: string) => ({
    type: 'stat_card',
    title: describedChart.component.title,
    value: 91.127,
    label: 'Kenya',
    period,
    unit: 'USD',
});

for (const [label, component, card, rows] of [
    ['a table saved as a bar chart', countryTable, { kind: 'table', view: 'chart-bar' }, plotted],
    ['a table in its own view', countryTable, { kind: 'table' }, plotted],
    ['a chart saved as a table', barChart, { kind: 'chart', view: 'chart-table' }, plotted],
    ['a key number', keyNumber, { kind: 'chart' }, null],
] as const) {
    test(`${label} serves the rows its saved view draws`, async () => {
        const [data] = await libraryChartData(
            backend(
                'snapshot',
                () => Response.json(slotBody('2023', 'CC BY 4.0', component('2023'))),
                card,
            ),
            artifact,
            ORIGIN,
        );

        assert.deepEqual(data?.rows ?? null, rows);
    });
}

test('the page shows the wording of its current read on an unmoved frame', async () => {
    let measure = 'current health expenditure per capita';
    const shares = backend('live', () => {
        const body = slotBody('2023', 'unknown');

        body.resolved_payload.description.about.measure.label = measure;

        return Response.json(body);
    });

    await libraryChartData(shares, artifact, ORIGIN);

    // The current read's entry runs out while the frame's entry is kept.
    for (const key of nextCache.stored.keys()) {
        if (key.includes('library-slot-current')) {
            nextCache.stored.delete(key);
        }
    }

    measure = 'health expenditure per person';

    const [data] = await libraryChartData(shares, artifact, ORIGIN);

    assert.equal(data?.dataset.variableMeasured, 'health expenditure per person');
});

test('a pinned read dfo-apis answers on another frame is refused and not kept', async () => {
    let reads = 0;
    const shares = backend('live', (frame) => {
        reads += frame ? 1 : 0;

        return Response.json(slotBody('2024', 'unknown', barChart('2024'), MOVED_FRAME));
    });
    const csv = () =>
        libraryCsvResponse(shares, artifact, { card: null, frame: DATASET_FRAME, open: true });
    const response = await csv();

    await csv();
    assert.deepEqual(
        [response.status, (await response.json()).code, reads],
        [502, 'backend_invalid', 2],
    );
    assert.ok(![...nextCache.stored.keys()].some((key) => key.includes('library-slot-frame')));
});

test('a chart whose slot read names no frame draws no table and says so', async (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    const shares = backend('live', () =>
        Response.json(slotBody('2023', 'unknown', barChart('2023'), null)),
    );

    assert.deepEqual(await libraryChartData(shares, artifact, ORIGIN), []);
    assert.deepEqual(
        warn.mock.calls.map(({ arguments: args }) => args),
        [['library_slot_unframed', { share: artifact.shareId, slot: 2 }]],
    );
});

test('a slot read that fails after the page gave up is logged', async (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    let pending: Promise<unknown> | undefined;
    const slow = backend('snapshot', async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));

        return Response.json({ code: 'service_unavailable', retryable: true }, { status: 503 });
    });

    await libraryChartData(slow, artifact, ORIGIN, {
        deadlineMs: 5,
        waitUntil: (read) => {
            pending = read;
        },
    });
    await pending;
    assert.deepEqual(
        warn.mock.calls.map(({ arguments: [, fields] }) => fields),
        [
            { share: artifact.shareId, card: 'health', code: 'page_deadline' },
            { share: artifact.shareId, card: 'health', code: 'service_unavailable' },
        ],
    );
});

test('a slow slot read leaves the page without the table, then fills the cache', async () => {
    let reads = 0;
    let pending: Promise<unknown> | undefined;
    const slow = backend('snapshot', async () => {
        reads += 1;
        await new Promise((resolve) => setTimeout(resolve, 100));

        return Response.json(slotBody('2023', 'unknown'));
    });

    const late = await libraryChartData(slow, artifact, ORIGIN, {
        deadlineMs: 10,
        waitUntil: (read) => {
            pending = read;
        },
    });

    assert.deepEqual(late, []);
    assert.ok(pending);
    await pending;

    const [cached] = await libraryChartData(slow, artifact, ORIGIN, { deadlineMs: 10 });

    assert.deepEqual(cached?.rows, plotted);
    assert.equal(reads, 1);
});

for (const [label, description, check] of [
    [
        'a one-character description gives way to one built from the chart',
        'x',
        (text: string) => {
            assert.ok(text.length >= 50);

            for (const part of [
                'Current health expenditure per capita',
                'Kenya',
                'Niger',
                '2023',
            ]) {
                assert.ok(text.includes(part), part);
            }

            assert.ok(text.includes('World Development Indicators'));
        },
    ],
    [
        'a long enough description is kept',
        artifact.description,
        (text: string) => assert.equal(text, artifact.description),
    ],
    [
        'a description over 5,000 characters is clipped',
        'word '.repeat(1_200),
        (text: string) => assert.ok(text.length <= 5_000 && text.length > 4_000),
    ],
] as const) {
    test(label, async () => {
        const [data] = await libraryChartData(
            backend('snapshot', () => Response.json(slotBody('2023', 'unknown'))),
            { ...artifact, description },
            ORIGIN,
        );

        assert.ok(data);
        check(data.dataset.description);
    });
}

// Rows for `series` in each of `periods`, in that order.
const rowsOf = (periods: readonly string[], series: number) =>
    periods.flatMap((period) =>
        Array.from({ length: series }, (_, n) => ({
            series: `S${n}`,
            period,
            value: n,
            unit: null,
        })),
    );
const years = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, n) => String(from + n));
const periodsOf = (rows: readonly { period: string }[]) => [
    ...new Set(rows.map(({ period }) => period)),
];

test('a table over its limit keeps the newest whole periods in their own order', () => {
    // 2000-2023 at 100 series is 2,400 rows; two whole years fit in 250.
    assert.deepEqual(periodsOf(recentRows(rowsOf(years(2000, 2023), 100), 250)), ['2022', '2023']);
    // Rows newest first stay in that order.
    assert.deepEqual(periodsOf(recentRows(rowsOf(years(2000, 2023).toReversed(), 100), 250)), [
        '2023',
        '2022',
    ]);
    // An interval ending last counts as the newest period.
    assert.deepEqual(periodsOf(recentRows(rowsOf(['2021', '2015/2023', '2022'], 2), 4)), [
        '2015/2023',
        '2022',
    ]);
    // A newest period over the limit gives its first rows.
    assert.deepEqual(
        recentRows(rowsOf(['2022', '2023'], 300), 250).map(({ series, period }) => [
            series,
            period,
        ]),
        rowsOf(['2023'], 250).map(({ series, period }) => [series, period]),
    );
    assert.equal(recentRows(rowsOf(['2023'], 5), 0).length, 0);
});

test('the page spends its row budget across cards in page order', async () => {
    const [data] = await libraryChartData(
        backend('snapshot', () => Response.json(slotBody('2023', 'unknown'))),
        artifact,
        ORIGIN,
    );

    assert.ok(data);

    const card = (id: string, rows: ReturnType<typeof rowsOf>) => ({
        ...data,
        id,
        rows,
        totalRows: rows.length,
    });
    const charts = [
        card('big', rowsOf(years(2016, 2023), 250)),
        card('small', rowsOf(['2023'], 40)),
        ...Array.from({ length: 22 }, (_, n) => card(`c${n}`, rowsOf(years(2000, 2023), 84))),
    ];
    const shown = withRowBudget(charts);
    const total = shown.reduce((sum, { rows }) => sum + rows.length, 0);

    assert.deepEqual(
        shown
            .slice(0, 3)
            .map(({ rows, totalRows, shownWindow }) => [rows.length, totalRows, shownWindow]),
        [
            [250, 2_000, { start: '2023', end: '2023' }],
            [40, 40, { start: '2023', end: '2023' }],
            [168, 2_016, { start: '2022', end: '2023' }],
        ],
    );
    assert.ok(total <= 1_500, `${total} rows`);
    // A card the budget has run out for shows no rows.
    assert.deepEqual(shown.at(-1)?.rows, []);
    assert.equal(shown.at(-1)?.shownWindow, null);
    assert.equal(shown.at(-1)?.totalRows, 2_016);
    // The Dataset block still covers the whole frame.
    assert.equal(shown[0].dataset, data.dataset);

    // The largest page: 24 cards of 2,000 rows.
    const largest = withRowBudget(
        Array.from({ length: 24 }, (_, n) => card(`l${n}`, rowsOf(years(2004, 2023), 100))),
    );

    assert.equal(
        largest.reduce((sum, { rows }) => sum + rows.length, 0),
        1_500,
    );
});

test('a page cuts a large table to its newest periods and links the whole frame', async () => {
    // 30 countries over 2014-2023: 300 rows, of which eight whole years fit.
    const table = {
        ...countryTable('2023'),
        rows: years(2014, 2023).flatMap((period) =>
            Array.from({ length: 30 }, (_, n) => ({
                series_id: 's_health',
                dimensions: { country: `Country ${n}` },
                period,
                unit: 'USD',
                value: n,
            })),
        ),
    };
    const [data] = await libraryChartData(
        backend('snapshot', () => Response.json(slotBody('2023', 'unknown', table)), {
            kind: 'table',
        }),
        artifact,
        ORIGIN,
    );

    assert.ok(data);
    assert.deepEqual(
        [data.rows.length, data.totalRows, data.shownWindow, data.window],
        [240, 300, { start: '2016', end: '2023' }, { start: '2014', end: '2023' }],
    );
    assert.equal(data.dataset.temporalCoverage, '2014/2023');
    assert.equal(data.dataset.distribution.contentUrl, `${ORIGIN}${pinned(DATASET_FRAME)}`);
});
