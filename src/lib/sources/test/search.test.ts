import assert from 'node:assert/strict';
import test from 'node:test';

import type { Filterable } from '../filters.ts';
import {
    filterCards,
    legacyFilter,
    matchesQuery,
    parseQuery,
    parseVia,
    provenanceGroups,
    publisherOptions,
    summaryLine,
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
    assert.equal(matchesQuery(card('Nameless', 'x', null, BASE), 'x'), false);
});

test('"World Bank" lists every World Bank source: the DFO import, then the ones via Google', () => {
    assert.deepEqual(titles(filterCards(cards, { q: 'World Bank', via: null })), [
        'International Debt Statistics (IDS)',
        'World Bank Datasets',
        'World Development Indicators',
    ]);
});

test('the two filters combine', () => {
    assert.deepEqual(titles(filterCards(cards, { q: 'world', via: 'base' })), [
        'World Bank Datasets',
        'World Development Indicators',
    ]);
    assert.deepEqual(titles(filterCards(cards, { q: 'world', via: 'un_system' })), [
        'World Food Programme',
    ]);
    assert.deepEqual(filterCards(cards, { q: 'nothing here', via: 'dfo' }), []);
});

test('with no filter, cards sort by provenance, DFO imports in their order, the rest by publisher then title', () => {
    assert.deepEqual(titles(filterCards(cards, { q: '', via: null })), [
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

test('the summary line reports the split, a single share without it, and no match', () => {
    assert.equal(
        summaryLine(cards),
        '10 sources: 3 ingested by DFO, 5 via Data Commons by Google, 2 via UN System Data Commons.',
    );
    assert.equal(
        summaryLine(filterCards(cards, { q: 'World Bank', via: null })),
        '3 sources: 1 ingested by DFO, 2 via Data Commons by Google.',
    );
    assert.equal(
        summaryLine(filterCards(cards, { q: '', via: 'base' })),
        '5 sources via Data Commons by Google.',
    );
    assert.equal(summaryLine([cards[1]!]), '1 source ingested by DFO.');
    assert.equal(summaryLine([]), 'No sources match.');
});

test('the search box offers the publishers whose name holds the query, most sources first', () => {
    assert.deepEqual(publisherOptions(cards, ''), [
        { id: 'dc/s/WorldBank', label: 'World Bank', count: 3 },
        { id: 'dc/s/Alpha', label: 'Alpha', count: 2 },
        { id: 'dc/s/OECD', label: 'OECD', count: 2 },
        { id: 'un/fao', label: 'FAO', count: 1 },
        { id: 'un/wfp', label: 'WFP', count: 1 },
        { id: 'dc/s/Zeta', label: 'Zeta', count: 1 },
    ]);
    assert.deepEqual(
        publisherOptions(cards, 'f').map((o) => o.label),
        ['FAO', 'WFP'],
    );
    assert.deepEqual(publisherOptions(cards, 'development'), []);
    assert.deepEqual(publisherOptions([card('X', 'dc/s/None', null, BASE)], 'none'), [
        { id: 'dc/s/None', label: 'dc/s/None', count: 1 },
    ]);
});

test('the URL values parse to a known provenance and the query as typed', () => {
    assert.equal(parseVia('base', cards), 'base');
    assert.equal(parseVia('dfo', cards), 'dfo');
    assert.equal(parseVia('dfo', [cards[0]!]), null);
    assert.equal(parseVia('other', cards), null);
    assert.equal(parseVia(null, cards), null);
    assert.equal(parseQuery('World Bank'), 'World Bank');
    assert.equal(parseQuery(null), '');
});

test("the drawer's ?filter= link reads as a provenance or a publisher's name", () => {
    assert.deepEqual(legacyFilter('un_system', cards), { via: 'un_system' });
    assert.deepEqual(legacyFilter('dc/s/WorldBank', cards), { q: 'World Bank' });
    assert.deepEqual(legacyFilter('dc/s/Nobody', cards), {});
    assert.deepEqual(legacyFilter(null, cards), {});
});
