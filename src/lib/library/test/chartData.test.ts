import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

// Before chartData.ts, which loads next/cache.
import { nextCache } from '../../test/nextCacheStub.ts';
import { SharesError, type SharesBackend } from '../../chat/apisShares.ts';
import {
    componentRead,
    DATASET_FRAME,
    MOVED_FRAME,
} from '../../studio/test/fixtures/component-read.ts';
import describedChart from '../../studio/test/fixtures/descriptions/envelope-line-chart-described.json' with { type: 'json' };
import { libraryChartData, libraryCsvResponse, readFailureResponse } from '../chartData.ts';

const artifact = {
    slug: 'health-expenditure',
    shareId: 'Ab3dEf7h',
    title: 'Health expenditure per capita',
    description: 'Health expenditure per person across three countries.',
    sources: [{ name: 'World Development Indicators', url: '/data/sources/wdi' }],
};
const ORIGIN = 'https://developmentfinance.org';
const CSV = '/library/health-expenditure/data.csv';
// The page's CSV link, pinned to the frame its rows are drawn on.
const pinned = (
    frame: { spec_id: string; content_version: string },
    query: Record<string, string> = {},
) =>
    `${CSV}?${new URLSearchParams({ ...query, frame: `${frame.spec_id}@${frame.content_version}` })}`;
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
    frame = DATASET_FRAME,
) => {
    const body = componentRead('cmp_test', 2, frame);

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

// A share of `shape` whose slot `n` answers `slot(n)`.
const shareBackend = (
    mode: 'live' | 'snapshot',
    { kind, slots, widgets, extra = {} }: Shape,
    slot: (n: number) => Response | Promise<Response>,
): SharesBackend => ({
    base: 'https://apis.example',
    nameCaller: () => {},
    fetch: async (input) => {
        const path = new URL(String(input)).pathname;

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

        const n = /^\/api\/presentation\/shares\/Ab3dEf7h\/slots\/(\d+)$/.exec(path)?.[1];

        assert.ok(n, path);

        return slot(Number(n));
    },
});

// A card share whose one card reads slot 2.
const backend = (
    mode: 'live' | 'snapshot',
    slot: () => Response | Promise<Response>,
    card: Card = { kind: 'chart' },
): SharesBackend =>
    shareBackend(
        mode,
        {
            kind: 'card',
            slots: [2],
            widgets: [{ id: 'health', kind: card.kind, turn: 1, slot: 1 }],
            extra: card.view ? { views: { health: card.view } } : {},
        },
        slot,
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
    assert.deepEqual(data.dataset.distribution, [
        { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${ORIGIN}${CSV}` },
        {
            '@type': 'DataDownload',
            encodingFormat: 'application/zip',
            contentUrl: `${ORIGIN}/api/share/Ab3dEf7h/cards/health/data?slot=2&format=csv&bundle=true`,
        },
    ]);
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

    const [entry] = nextCache.stored.values();

    assert.deepEqual(JSON.parse(entry.data.body).charts[0].rows, plotted);

    answer = () => Response.json(slotBody('2024', 'unknown'));

    const [recovered] = await libraryChartData(shares, artifact, ORIGIN);

    assert.deepEqual(
        recovered?.rows.map(({ period }) => period),
        ['2024', '2024', '2024'],
    );
});

test('the CSV holds the rows the page showed after the slot moves on', async () => {
    let moved = false;
    const shares = backend('live', () =>
        Response.json(
            moved
                ? slotBody('2024', 'unknown', barChart('2024'), MOVED_FRAME)
                : slotBody('2023', 'unknown'),
        ),
    );
    const [page] = await libraryChartData(shares, artifact, ORIGIN);
    const csv = async (href: string) => {
        const frame = new URL(href, ORIGIN).searchParams.get('frame');
        const response = await libraryCsvResponse(shares, artifact, {
            card: null,
            frame,
            open: true,
        });

        return response;
    };

    assert.ok(page);
    assert.equal(page.csvHref, pinned(DATASET_FRAME));
    assert.equal(page.dataset.distribution[0].contentUrl, `${ORIGIN}${CSV}`);
    assert.equal(page.dataset.dateModified, undefined);

    moved = true;

    const response = await csv(page.csvHref);

    assert.equal(response.status, 200);
    assert.deepEqual(
        [response.headers.get('cache-control'), response.headers.get('link')],
        [
            'public, max-age=300, must-revalidate',
            `<${ORIGIN}/library/health-expenditure>; rel="cite-as"`,
        ],
    );
    assert.equal(
        await response.text(),
        [
            'Country,Year,Value,Unit',
            ...page.rows.map(({ series, period, value, unit }) =>
                [series, period, value, unit].join(','),
            ),
            '',
        ].join('\r\n'),
    );

    // Once the entry moves to the new frame, the old page's link refuses
    // and the unpinned address serves the new rows.
    nextCache.expire();
    await libraryChartData(shares, artifact, ORIGIN);

    const stale = await csv(page.csvHref);
    const current = await csv(CSV);

    assert.deepEqual([stale.status, (await stale.json()).code], [409, 'frame_changed']);
    assert.equal((await current.text()).split('\r\n')[1], 'Kenya,2024,91.127,USD');
});

for (const [label, slot, expected] of [
    [
        'a rate-limited card read answers 429 with its wait, and is read again',
        () =>
            new Response(JSON.stringify({ code: 'rate_limited', retryable: true }), {
                status: 429,
                headers: { 'retry-after': '30' },
            }),
        { status: 429, code: 'rate_limited', retryAfter: '30', reads: 2 },
    ],
    [
        'a card dfo-apis cannot draw answers 422, and is kept',
        () => Response.json({ code: 'constraint_violation' }, { status: 422 }),
        { status: 422, code: 'constraint_violation', retryAfter: null, reads: 1 },
    ],
    [
        'a card whose view draws no rows answers 404',
        () => Response.json(slotBody('2023', 'unknown', keyNumber('2023'))),
        { status: 404, code: 'not_found', retryAfter: null, reads: 1 },
    ],
] as const) {
    test(`the CSV route: ${label}`, async () => {
        let reads = 0;
        const shares = backend('snapshot', () => {
            reads += 1;

            return slot();
        });
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

test('a canvas serves each card it shows, under its own title and CSV address', async () => {
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
                titles: { spend: 'Spending as a chart', rows: 'Spending as a table' },
            },
        },
        (n) => {
            reads.push(n);

            return Response.json(
                slotBody('2023', 'unknown', n === 1 ? barChart('2023') : countryTable('2022')),
            );
        },
    );
    const data = await libraryChartData(shares, artifact, ORIGIN);

    assert.deepEqual(
        data.map(({ id, dataset, csvHref }) => [
            id,
            dataset.name,
            csvHref,
            dataset.temporalCoverage,
        ]),
        [
            ['spend', 'Spending as a chart', pinned(DATASET_FRAME, { card: 'spend' }), '2023'],
            ['rows', 'Spending as a table', pinned(DATASET_FRAME, { card: 'rows' }), '2022'],
        ],
    );
    assert.deepEqual(reads.toSorted(), [1, 2]);

    const csv = async (card: string | null) => {
        const response = await libraryCsvResponse(shares, artifact, {
            card,
            frame: null,
            open: false,
        });

        return [response.status, (await response.text()).split('\r\n')[1]];
    };

    assert.deepEqual(
        [await csv('rows'), await csv(null), (await csv('gone'))[0]],
        [[200, 'Kenya,2022,91.127,USD'], [200, 'Kenya,2023,91.127,USD'], 404],
    );
});

test('the CSV route answers a failed read under the status it calls for', () => {
    const answers = [
        new SharesError('not_found', { status: 404 }),
        new SharesError('request_invalid', { status: 400 }),
        new SharesError('unprocessable', { status: 422 }),
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
