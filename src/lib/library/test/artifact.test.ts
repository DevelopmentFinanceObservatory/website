import assert from 'node:assert/strict';
import test from 'node:test';

import {
    citation,
    filterArtifacts,
    filterOptions,
    type LibraryArtifact,
    libraryDate,
    type LibraryFilters,
    parseList,
    serializeList,
    textUpdated,
} from '../artifact.ts';

const artifact = (slug: string, partial: Partial<LibraryArtifact> = {}): LibraryArtifact => ({
    id: slug,
    slug,
    shareId: 'Ab3dEf7h',
    kind: 'chart',
    mode: 'live',
    title: slug,
    description: '',
    contentTitle: null,
    content: null,
    sources: [],
    steps: [],
    topics: [],
    cardDates: [],
    cardCites: [],
    publishedAt: '2026-12-12T10:00:00.000Z',
    updatedAt: '2026-12-12T10:00:00.000Z',
    revision: 0,
    ...partial,
});

const ethiopia = artifact('eth-health-oda', {
    title: 'Health ODA to Ethiopia, 2016–2024',
    description: 'Annual health aid disbursements',
    topics: ['Health', 'ODA'],
    sources: [
        { name: 'OECD CRS', url: null },
        { name: 'World Bank IDS, 2024', url: null },
    ],
});
const debt = artifact('ghana-debt', {
    kind: 'canvas',
    mode: 'snapshot',
    title: 'Ghana debt service',
    topics: ['Debt'],
    sources: [{ name: 'World Bank IDS, 2024', url: null }],
});
const climate = artifact('climate-finance', { kind: 'data', topics: ['Climate'] });
const all = [ethiopia, debt, climate];

const none: LibraryFilters = { q: '', types: [], topics: [], sources: [], statuses: [] };
const slugs = (list: readonly LibraryArtifact[]) => list.map((item) => item.slug);

test('text matches the title, description, topics and sources', () => {
    assert.deepEqual(slugs(filterArtifacts(all, { ...none, q: 'ethiopia' })), ['eth-health-oda']);
    assert.deepEqual(slugs(filterArtifacts(all, { ...none, q: 'oda' })), ['eth-health-oda']);
    assert.deepEqual(slugs(filterArtifacts(all, { ...none, q: 'world  bank' })), [
        'eth-health-oda',
        'ghana-debt',
    ]);
    assert.deepEqual(slugs(filterArtifacts(all, { ...none, q: '  ' })), slugs(all));
});

test('each filter admits any of its picks, and the filters combine', () => {
    assert.deepEqual(slugs(filterArtifacts(all, { ...none, types: ['chart', 'data'] })), [
        'eth-health-oda',
        'climate-finance',
    ]);
    assert.deepEqual(slugs(filterArtifacts(all, { ...none, statuses: ['snapshot'] })), [
        'ghana-debt',
    ]);
    assert.deepEqual(
        slugs(
            filterArtifacts(all, { ...none, sources: ['World Bank IDS, 2024'], topics: ['Debt'] }),
        ),
        ['ghana-debt'],
    );
});

test('the filters offer what the artifacts carry, with counts', () => {
    const options = filterOptions(all);

    assert.deepEqual(
        options.types.map((option) => [option.label, option.count]),
        [
            ['Chart', 1],
            ['Canvas', 1],
            ['Data', 1],
        ],
    );
    assert.deepEqual(
        options.sources.map((option) => [option.value, option.count]),
        [
            ['OECD CRS', 1],
            ['World Bank IDS, 2024', 2],
        ],
    );
    assert.deepEqual(
        filterOptions([ethiopia]).statuses.map((option) => option.value),
        ['live'],
    );

    // A stale link's picks are listed last, by name, with a count of 0.
    const stale = filterOptions([ethiopia], {
        types: ['chart', 'key_number', 'bogus'],
        topics: ['Gone'],
        sources: [],
        statuses: ['snapshot'],
    });
    const named = (options: readonly { label: string; count: number }[]) =>
        options.map((option) => [option.label, option.count]);

    assert.deepEqual(named(stale.types), [
        ['Chart', 1],
        ['Key number', 0],
        ['bogus', 0],
    ]);
    assert.deepEqual(named(stale.topics), [
        ['Health', 1],
        ['ODA', 1],
        ['Gone', 0],
    ]);
    assert.deepEqual(named(stale.statuses), [
        ['Live', 1],
        ['Snapshot', 0],
    ]);
});

test('a list param keeps names with commas, each once', () => {
    const picked = ['World Bank IDS, 2024', 'OECD CRS'];

    assert.deepEqual(parseList(serializeList(picked)), picked);
    assert.deepEqual(parseList('a|a||b'), ['a', 'b']);
    assert.deepEqual(parseList(null), []);
    assert.equal(serializeList([]), null);
});

test("the citation gives one line per card's own citation, merged when alike, from the page", () => {
    const wdi = { text: 'World Bank (2026)', title: 'World Development Indicators' };
    const crs = { text: 'OECD (2026)', title: 'Creditor Reporting System' };
    const uncited = { sources: ['OECD CRS'], title: 'Health ODA to Ethiopia' };
    const accessed = new Date('2027-01-27T09:00:00Z');
    const page = 'https://developmentfinance.org/library/eth-health-oda';
    const from = `Retrieved 27 January 2027 from ${page}.`;
    const cite = (
        cardCites: LibraryArtifact['cardCites'],
        mode: LibraryArtifact['mode'] = 'live',
    ) =>
        citation(
            { ...ethiopia, mode, cardCites },
            'https://developmentfinance.org',
            accessed,
        ).split('\n');

    assert.deepEqual(cite([wdi, crs, wdi]), [
        `World Bank (2026). "World Development Indicators" [dataset]. ${from}`,
        `OECD (2026). "Creditor Reporting System" [dataset]. ${from}`,
    ]);

    // A card without its source's citation names its own sources and title.
    assert.deepEqual(cite([wdi, uncited, uncited, { sources: [], title: 'Notes' }]), [
        `World Bank (2026). "World Development Indicators" [dataset]. ${from}`,
        `OECD CRS. "Health ODA to Ethiopia". ${from}`,
        `"Notes". ${from}`,
    ]);

    // A snapshot names the day its data was captured, as Studio does.
    assert.deepEqual(cite([wdi], 'snapshot'), [
        `World Bank (2026). "World Development Indicators" [dataset]. Retrieved 27 January 2027 from ${page} (snapshot, data as of 12 Dec 2026).`,
    ]);

    // An artifact that holds no card's citation is cited to the Observatory.
    assert.deepEqual(cite([]), [
        `Development Finance Observatory (2026). "Health ODA to Ethiopia, 2016–2024". ${from} Data: OECD CRS, World Bank IDS, 2024.`,
    ]);
    assert.equal(
        citation(climate, '', accessed),
        `Development Finance Observatory (2026). "climate-finance". Retrieved 27 January 2027 from /library/climate-finance.`,
    );
});

test('a date prints as its UTC day, as the citation prints it', () => {
    assert.equal(libraryDate('2026-12-12T23:30:00.000-05:00'), '13 December 2026');
    assert.equal(libraryDate(new Date('2027-01-27T09:00:00Z')), '27 January 2027');
});

test('the text counts as updated only after publication', () => {
    assert.equal(textUpdated(ethiopia), false);
    assert.equal(textUpdated({ ...ethiopia, updatedAt: '2026-12-12T10:00:01.000Z' }), true);
});
