import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { LibraryCardDates } from '../../../../db/schema.ts';
import type { CardInfo, TableWidget, TextWidget } from '../../chat/widgets.ts';
import { cardDataDates, dataThroughText, liveDataThrough } from '../dataThrough.ts';
import type { LiveCanvas, LiveCardState } from '../liveCards.ts';

const info = (partial: Partial<CardInfo>): CardInfo => ({
    label: 'OECD CRS',
    sourceId: null,
    sourceName: null,
    sourceCount: 1,
    indicatorCount: 1,
    years: null,
    unit: null,
    licence: null,
    dataThrough: null,
    lastRefreshed: null,
    ...partial,
});

// A described card as dfo-apis serves it, whose latest period is 2024.
const described: unknown = JSON.parse(
    readFileSync(
        new URL('./fixtures/descriptions/description-card-revision.json', import.meta.url),
        'utf8',
    ),
).input;

test("a card's data runs through its provenance's period, else its description's", () => {
    assert.deepEqual(cardDataDates(info({ dataThrough: '2023', lastRefreshed: '2026-10-01' })), {
        dataThrough: '2023',
        lastRefreshed: '2026-10-01',
    });
    assert.deepEqual(cardDataDates(info({ dataThrough: '', description: described })), {
        dataThrough: '2024',
        lastRefreshed: null,
    });
    assert.deepEqual(cardDataDates(info({ description: { refused: true } })), {
        dataThrough: null,
        lastRefreshed: null,
    });
    assert.deepEqual(cardDataDates(undefined), { dataThrough: null, lastRefreshed: null });
});

test('the cards read as one period, or as the earliest and latest by the day each ends', () => {
    const cases: [(string | null)[], string | null][] = [
        [[], null],
        [[null, null], null],
        // A card with no period could be older or newer than the rest.
        [['2024', null, '2024'], null],
        [['2024', '2024'], '2024'],
        [['2024', '2022', '2023'], '2022–2024'],
        [['2018/2022', '2024-Q3'], '2022–2024-Q3'],
        // A year runs to December, after its months, quarters and halves.
        [['2024', '2024-06', '2024-Q1'], '2024-Q1–2024'],
        [['2024-H1', '2024-05-31', '2023-12'], '2023-12–2024-H1'],
    ];

    for (const [periods, expected] of cases) {
        assert.equal(dataThroughText(periods), expected, JSON.stringify(periods));
    }
});

test("a Library snapshot's Data through fact names a period only when every data card names one", () => {
    const dates = (...periods: (string | null)[]): LibraryCardDates[] =>
        periods.map((dataThrough) => ({ dataThrough, lastRefreshed: null }));
    const cases: [string, LibraryCardDates[], string | null][] = [
        ['one card names none', dates('2024', null), null],
        ['all known and equal', dates('2024', '2024'), '2024'],
        ['known and different', dates('2024', '2022'), '2022–2024'],
    ];

    // As LibraryArtifact reads a snapshot's cardDates.
    for (const [name, cardDates, expected] of cases) {
        assert.equal(dataThroughText(cardDates.map((date) => date.dataThrough)), expected, name);
    }
});

// A data card through `period` (null: none named) and a text card.
const card = (id: string, period: string | null): TableWidget => ({
    kind: 'table',
    id,
    title: '',
    columns: [],
    rows: [],
    info: info({ dataThrough: period }),
});
const text: TextWidget = { kind: 'text', id: 'n1', title: 'Mine', body: 'Words' };

const READY: LiveCardState = {
    status: 'ready',
    outcome: 'current',
    card: {
        component_id: 'cmp_a',
        revision: 1,
        payload: {},
        fact_summary: { series: [], series_cut: 0, window: null, unit: null },
    },
};
const LOADING: LiveCardState = { status: 'loading' };
const FAILED: LiveCardState = { status: 'error', code: 'backend_timeout' };

test('a live canvas names a period only once every data card has filled and names one', () => {
    const cases: [string, [string | null, LiveCardState][], string | null][] = [
        [
            'all match',
            [
                ['2024', READY],
                ['2024', READY],
            ],
            '2024',
        ],
        [
            'differ',
            [
                ['2022', READY],
                ['2024', READY],
            ],
            '2022–2024',
        ],
        [
            'one loading',
            [
                ['2024', READY],
                ['2024', LOADING],
            ],
            null,
        ],
        [
            'one unknown',
            [
                ['2024', READY],
                [null, READY],
            ],
            null,
        ],
        [
            'one failed',
            [
                ['2024', READY],
                ['2024', FAILED],
            ],
            null,
        ],
    ];

    for (const [name, cards, expected] of cases) {
        const widgets = [text, ...cards.map(([period], index) => card(`c${index}`, period))];
        const live: LiveCanvas = {
            shareId: 'Ab3dEf7h',
            snapshot: false,
            createdAt: undefined,
            states: Object.fromEntries(cards.map(([, state], index) => [`c${index}`, state])),
            retry: () => {},
        };

        assert.equal(liveDataThrough(widgets, live), expected, name);
    }
});
