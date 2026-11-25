import assert from 'node:assert/strict';
import test from 'node:test';

import type { Filterable } from '../filters.ts';
import {
    filterCards,
    legacyFilter,
    matchesQuery,
    parsePublishers,
    parseQuery,
    parseVia,
    provenanceGroups,
    publisherOptions,
    serializePublishers,
    type SourceFilters,
    summaryLine,
    togglePublisher,
} from '../search.ts';

const DFO = { id: 'dfo', label: 'Development Finance Observatory' } as const;
const BASE = { id: 'base', label: 'Data Commons by Google' } as const;
const UN = { id: 'un_system', label: 'UN System Data Commons' } as const;

const card = (
    title: string,
    family: string,
    publisher: string | null,
    dataCommons: Filterable['dataCommons'],
): Filterable => ({ title, family, publisher, dataCommons });

const cards = [
    card('World Food Programme', 'un/wfp', 'WFP', UN),
    card('CRS', 'dc/s/OECD', 'OECD', DFO),
    card('International Debt Statistics (IDS)', 'dc/s/WorldBank', 'World Bank', DFO),
    card('Zeta Stats', 'dc/s/Zeta', 'Zeta', BASE),
    card('World Development Indicators', 'dc/s/WorldBank', 'World Bank', BASE),
    card('Alpha 2', 'dc/s/Alpha', 'Alpha', BASE),
    card('FAO', 'un/fao', 'FAO', UN),
    card('Alpha 1', 'dc/s/Alpha', 'Alpha', BASE),
    card('DAC', 'dc/s/OECD', 'OECD', DFO),
    card('World Bank Datasets', 'dc/s/WorldBank', 'World Bank', BASE),
];

const titles = (list: readonly Filterable[]) => list.map((c) => c.title);

const filters = (partial: Partial<SourceFilters>): SourceFilters => ({
    q: '',
    via: null,
    publishers: [],
    ...partial,
});

test('one chip per provenance with cards: DFO, then Google, then UN, each counting its cards', () => {
    assert.deepEqual(provenanceGroups(cards), [
        { id: 'dfo', label: 'DFO', count: 3 },
        { id: 'base', label: 'Data Commons by Google', count: 5 },
        { id: 'un_system', label: 'UN System Data Commons', count: 2 },
    ]);
    assert.deepEqual(
        provenanceGroups([cards[0]!]).map((g) => g.id),
        ['un_system'],
    );
    assert.deepEqual(provenanceGroups([]), []);
});

test('a query matches part of the title or the publisher, ignoring case and spacing', () => {
    assert.equal(matchesQuery(cards[4]!, 'development'), true);
    assert.equal(matchesQuery(cards[2]!, 'world  BANK'), true);
    assert.equal(matchesQuery(cards[3]!, 'world bank'), false);
    assert.equal(matchesQuery(cards[3]!, ''), true);
    assert.equal(matchesQuery(cards[3]!, '   '), true);
    assert.equal(matchesQuery(card('Nameless', 'x', null, BASE), 'name'), true);
    // A card with no publisher label matches on the dcid the publisher list names it by.
    assert.equal(matchesQuery(card('Untitled', 'dc/s/None', null, BASE), 'none'), true);
});

test('"World Bank" lists every World Bank source: the DFO import, then the ones via Google', () => {
    assert.deepEqual(titles(filterCards(cards, filters({ q: 'World Bank' }))), [
        'International Debt Statistics (IDS)',
        'World Bank Datasets',
        'World Development Indicators',
    ]);
});

test('picked publishers add up, and the other filters narrow their sources', () => {
    assert.deepEqual(titles(filterCards(cards, filters({ publishers: ['OECD', 'Alpha'] }))), [
        'CRS',
        'DAC',
        'Alpha 1',
        'Alpha 2',
    ]);
    assert.deepEqual(
        titles(filterCards(cards, filters({ publishers: ['World Bank'], via: 'base' }))),
        ['World Bank Datasets', 'World Development Indicators'],
    );
    assert.deepEqual(
        titles(filterCards(cards, filters({ publishers: ['World Bank', 'Alpha'], q: '1' }))),
        ['Alpha 1'],
    );
    assert.deepEqual(filterCards(cards, filters({ publishers: ['Nobody'] })), []);
});

test('the text and the provenance combine', () => {
    assert.deepEqual(titles(filterCards(cards, filters({ q: 'world', via: 'base' }))), [
        'World Bank Datasets',
        'World Development Indicators',
    ]);
    assert.deepEqual(titles(filterCards(cards, filters({ q: 'world', via: 'un_system' }))), [
        'World Food Programme',
    ]);
    assert.deepEqual(filterCards(cards, filters({ q: 'nothing here', via: 'dfo' })), []);
});

test('with no filter, cards sort by provenance, DFO imports in their order, the rest by publisher then title', () => {
    assert.deepEqual(titles(filterCards(cards, filters({}))), [
        'CRS',
        'International Debt Statistics (IDS)',
        'DAC',
        'Alpha 1',
        'Alpha 2',
        'World Bank Datasets',
        'World Development Indicators',
        'Zeta Stats',
        'FAO',
        'World Food Programme',
    ]);
});

test('the summary line counts the sources, the publishers showing, and names the chosen provenance', () => {
    assert.equal(summaryLine(cards), '10 sources.');
    assert.equal(summaryLine(filterCards(cards, filters({ q: 'World Bank' }))), '3 sources.');
    assert.equal(
        summaryLine(filterCards(cards, filters({ publishers: ['OECD', 'Alpha'] })), true),
        '4 sources from 2 publishers.',
    );
    assert.equal(summaryLine([cards[1]!], true), '1 source from 1 publisher.');
    // Two picked, one showing under the chip: the line counts the one.
    assert.equal(
        summaryLine(
            filterCards(cards, filters({ publishers: ['World Bank', 'FAO'], via: 'base' })),
            true,
            'Data Commons by Google',
        ),
        '2 sources from 1 publisher via Data Commons by Google.',
    );
    assert.equal(
        summaryLine(filterCards(cards, filters({ via: 'base' })), false, 'Data Commons by Google'),
        '5 sources via Data Commons by Google.',
    );
    assert.equal(
        summaryLine(filterCards(cards, filters({ via: 'dfo', publishers: ['OECD'] })), true, 'DFO'),
        '2 sources from 1 publisher via DFO.',
    );
    assert.equal(summaryLine([]), 'No sources match.');
});

test('the search box offers the publishers whose name holds the query, most sources first', () => {
    assert.deepEqual(publisherOptions(cards, ''), [
        { label: 'World Bank', count: 3 },
        { label: 'Alpha', count: 2 },
        { label: 'OECD', count: 2 },
        { label: 'FAO', count: 1 },
        { label: 'WFP', count: 1 },
        { label: 'Zeta', count: 1 },
    ]);
    assert.deepEqual(
        publisherOptions(cards, 'f').map((o) => o.label),
        ['FAO', 'WFP'],
    );
    assert.deepEqual(publisherOptions(cards, 'development'), []);
    assert.deepEqual(publisherOptions([card('X', 'dc/s/None', null, BASE)], 'none'), [
        { label: 'dc/s/None', count: 1 },
    ]);
    // An empty label names the publisher by its dcid, as a missing one does.
    assert.deepEqual(publisherOptions([card('X', 'dc/s/Blank', '', BASE)], ''), [
        { label: 'dc/s/Blank', count: 1 },
    ]);
});

test('picked publishers the query or the chip would hide lead the list, counting 0 where the cards hold none', () => {
    const google = cards.filter((c) => c.dataCommons.id === 'base');

    // With FAO picked and then the Google chip, FAO stays offered to be unticked.
    assert.deepEqual(publisherOptions(google, 'f', ['FAO']), [{ label: 'FAO', count: 0 }]);
    assert.deepEqual(publisherOptions(cards, 'alpha', ['Zeta', 'World Bank']), [
        { label: 'Zeta', count: 1 },
        { label: 'World Bank', count: 3 },
        { label: 'Alpha', count: 2 },
    ]);
    // A pick the list holds anyway keeps its place.
    assert.deepEqual(
        publisherOptions(cards, '', ['OECD']).map((o) => o.label),
        ['World Bank', 'Alpha', 'OECD', 'FAO', 'WFP', 'Zeta'],
    );
    assert.deepEqual(
        publisherOptions(cards, 'o', ['OECD', 'Alpha']).map((o) => o.label),
        ['Alpha', 'World Bank', 'OECD', 'FAO'],
    );
});

test('two graph nodes with one publisher name make one row, counting both', () => {
    assert.deepEqual(
        publisherOptions(
            [card('GHO', 'dc/s/WHO', 'WHO', BASE), card('WHO', 'undata/p/WHO', 'WHO', UN)],
            'who',
        ),
        [{ label: 'WHO', count: 2 }],
    );
});

test('togglePublisher adds a name once and removes it again', () => {
    assert.deepEqual(togglePublisher([], 'OECD'), ['OECD']);
    assert.deepEqual(togglePublisher(['OECD'], 'Alpha'), ['OECD', 'Alpha']);
    assert.deepEqual(togglePublisher(['OECD', 'Alpha'], 'OECD'), ['Alpha']);
});

test('the URL values parse to a known provenance, the query as typed, and known publishers', () => {
    assert.equal(parseVia('base', cards), 'base');
    assert.equal(parseVia('dfo', cards), 'dfo');
    assert.equal(parseVia('dfo', [cards[0]!]), null);
    assert.equal(parseVia('other', cards), null);
    assert.equal(parseVia(null, cards), null);
    assert.equal(parseQuery('World Bank'), 'World Bank');
    assert.equal(parseQuery(null), '');
    assert.deepEqual(parsePublishers('World Bank|OECD|World Bank|Nobody', cards), [
        'World Bank',
        'OECD',
    ]);
    assert.deepEqual(parsePublishers(null, cards), []);
    assert.deepEqual(parsePublishers('', cards), []);
    // A card with an empty label names its publisher by dcid, so no URL picks ''.
    const blank = [...cards, card('Blank', 'dc/s/Blank', '', BASE)];
    assert.deepEqual(parsePublishers(null, blank), []);
    assert.deepEqual(parsePublishers('|OECD|', blank), ['OECD']);
});

test('picked publishers serialize bar-separated, since their names hold commas, and none as null', () => {
    const cso = card('Census', 'dc/s/CSO', 'Central Statistics Office (CSO), Ireland', BASE);
    const picked = ['Central Statistics Office (CSO), Ireland', 'OECD'];

    assert.equal(serializePublishers(picked), 'Central Statistics Office (CSO), Ireland|OECD');
    assert.deepEqual(parsePublishers(serializePublishers(picked), [...cards, cso]), picked);
    assert.equal(serializePublishers([]), null);
});

test('a publisher name holding a bar or a percent sign survives the URL', () => {
    const named = ['A | B', '100% C', 'D %7C E', 'World Bank'].map((name) =>
        card(name, `dc/s/${name}`, name, BASE),
    );

    for (const [picked, value] of [
        [['A | B'], 'A %7C B'],
        [['100% C', 'World Bank'], '100%25 C|World Bank'],
        [['D %7C E'], 'D %257C E'],
    ] as const) {
        assert.equal(serializePublishers(picked), value);
        assert.deepEqual(parsePublishers(value, named), picked);
    }

    // Escapes read in either case.
    assert.deepEqual(parsePublishers('A %7c B|100%25 C', named), ['A | B', '100% C']);
    // A value with unescaped names reads as written.
    assert.deepEqual(parsePublishers('World Bank|OECD', cards), ['World Bank', 'OECD']);
});

test('an old ?filter= link reads as a provenance or picked publishers', () => {
    for (const [raw, expected] of [
        ['un_system', { via: 'un_system' }],
        // A publisher's dcid picks the publisher, with its sources from every
        // provenance.
        ['dc/s/WorldBank', { publishers: ['World Bank'] }],
        ['dc/s/WorldBank,dc/s/OECD', { publishers: ['World Bank', 'OECD'] }],
        // A Data Commons id beside a publisher is dropped.
        ['dc/s/WorldBank,base', { publishers: ['World Bank'] }],
        ['base,dc/s/Alpha', { publishers: ['Alpha'] }],
        ['base,un_system', {}],
        ['dc/s/Nobody', {}],
        ['', {}],
        [null, {}],
    ] as const) {
        assert.deepEqual(legacyFilter(raw, cards), expected, String(raw));
    }
});
