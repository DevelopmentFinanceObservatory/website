import assert from 'node:assert/strict';
import test from 'node:test';

import { filterGroups, filterId, orderCards, type Filterable } from '../filters.ts';

const DFO = { id: 'dfo', label: 'Development Finance Observatory' } as const;
const BASE = { id: 'base', label: 'Data Commons by Google' } as const;
const UN = { id: 'un_system', label: 'UN System Data Commons' } as const;

const card = (
    title: string,
    family: string,
    publisher: string,
    dataCommons: Filterable['dataCommons'],
): Filterable => ({ title, family, publisher, dataCommons });

const cards = [
    card('UN B', 'un/wfp', 'WFP', UN),
    card('CRS', 'dc/s/OECD', 'OECD', DFO),
    card('Base Z', 'dc/s/Zeta', 'Zeta', BASE),
    card('WDI', 'dc/s/WorldBank', 'World Bank', DFO),
    card('Base A2', 'dc/s/Alpha', 'Alpha', BASE),
    card('UN A', 'un/fao', 'FAO', UN),
    card('Base A1', 'dc/s/Alpha', 'Alpha', BASE),
    card('DAC', 'dc/s/OECD', 'OECD', DFO),
];

test('an Observatory card answers to its publisher, an upstream card to its origin', () => {
    assert.equal(filterId(cards[1]), 'dc/s/OECD');
    assert.equal(filterId(cards[0]), 'un_system');
    assert.equal(filterId(cards[2]), 'base');
});

test('chips: Observatory publishers in first-appearance order, then base, then UN', () => {
    assert.deepEqual(filterGroups(cards), [
        { id: 'dc/s/OECD', label: 'OECD', count: 2 },
        { id: 'dc/s/WorldBank', label: 'World Bank', count: 1 },
        { id: 'base', label: 'Data Commons by Google', count: 3 },
        { id: 'un_system', label: 'UN System Data Commons', count: 2 },
    ]);
});

test('an origin with no cards has no chip', () => {
    assert.deepEqual(
        filterGroups([cards[1], cards[2]]).map((group) => group.id),
        ['dc/s/OECD', 'base'],
    );
    assert.deepEqual(filterGroups([]), []);
});

test('cards: Observatory order kept, origins sorted by publisher then title', () => {
    assert.deepEqual(
        orderCards(cards).map((c) => c.title),
        ['CRS', 'DAC', 'WDI', 'Base A1', 'Base A2', 'Base Z', 'UN A', 'UN B'],
    );
});
