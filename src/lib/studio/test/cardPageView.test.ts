/**
 * `cardPageView.ts`: the card page's sections for a described card, a
 * computed card, a card with no description and a plan card, and how the page
 * finds the card standing in a replaced card's place.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { CardInfo, Widget } from '../../chat/widgets.ts';
import { cardPageView, currentCardId, replacedChain, type CardPageInput } from '../cardPageView.ts';
import type { ApprovedPlan } from '../plan.ts';

const FIXTURES = new URL('./fixtures/descriptions/', import.meta.url);
const read = (name: string): Record<string, unknown> =>
    JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'));

const DESCRIBED = read('envelope-line-chart-described.json')['description'] as {
    about: { drawn: { dimensions: unknown[] } };
};
const COMPUTED = read('description-computed-quotient-credited.json')['input'];

const info = (description?: unknown, extra: Partial<CardInfo> = {}): CardInfo => ({
    label: 'OECD CRS · 3 indicator(s)',
    sourceId: null,
    sourceName: null,
    sourceCount: 1,
    indicatorCount: 3,
    years: { start: '2010', end: '2024' },
    unit: 'US dollars',
    licence: null,
    dataThrough: null,
    lastRefreshed: null,
    description,
    ...extra,
});

const card = (cardInfo: CardInfo, id = 'c1', turn = 1): Widget & { turn: number } => ({
    kind: 'key_number',
    id,
    label: 'Health aid',
    value: '1',
    info: cardInfo,
    turn,
});

const page = (input: Partial<CardPageInput> & { widget: CardPageInput['widget'] }) =>
    cardPageView({
        title: 'Health aid',
        options: { retrievedOn: '2026-10-12' },
        messages: [
            { role: 'user', text: 'How much health aid?', turn: 1 },
            { role: 'bot', text: 'Here it is.' },
        ],
        ...input,
    });

const keys = (view: ReturnType<typeof page>) => view?.measures.map((row) => row.key);

test('a described card keys its rows years, unit, shows, then counts', () => {
    const counted = structuredClone(DESCRIBED);

    counted.about.drawn.dimensions.push({
        property: { ref: 'financingProvider', label: 'provider' },
        count: 63,
        of: 63,
    });

    const view = page({ widget: card(info(counted)) });

    assert.deepEqual(keys(view), ['years', 'unit', 'shows', 'count:Providers']);
    assert.equal(view?.measures[1]?.value, 'US dollars, current prices');
    assert.equal(view?.measures[2]?.terms?.length, 3);
    assert.deepEqual(view?.origin, { kind: 'turn', turn: 1, question: 'How much health aid?' });
    assert.ok(view?.cite?.full);
    assert.equal(view?.plan, null);
});

test('a computed card keeps its calculation and says who computed it', () => {
    const view = page({ widget: card(info(COMPUTED)) });

    assert.deepEqual(keys(view), ['years', 'unit']);
    assert.ok(view?.calculation);
    assert.ok(view?.from);
    assert.deepEqual(view?.inputs, []);
});

test('a card with no description shows the legacy facts, keyed', () => {
    const view = page({
        widget: card(
            info(undefined, {
                dataThrough: '2024',
                citation: 'OECD (2026). CRS.',
                leftOut: ['No 2024 value for Ghana.'],
            }),
        ),
    });

    assert.deepEqual(keys(view), ['years', 'indicators', 'unit', 'data_through']);
    assert.deepEqual(view?.leftOut, ['No 2024 value for Ghana.']);
    assert.deepEqual(view?.cite, { short: 'OECD (2026). CRS.', full: null, offer: null });
    assert.equal(view?.made, null);
});

test('a plan card names its plan, lists its choices unfiltered and its siblings', () => {
    const approved: ApprovedPlan = {
        plan_version_id: 'pv1',
        version: 1,
        revision: null,
        title: 'Health aid to Nigeria',
        summary: null,
        steps: [],
        choices: [
            { question: 'Prices', chosen: 'Current prices' },
            { question: 'Providers', chosen: 'All providers' },
        ],
        caveats: [],
    };
    const view = page({
        widget: card(info(DESCRIBED), 'c2'),
        plan: { link: { turn: 1, title: approved.title, cards: ['c1', 'c2', 'c3'] }, approved },
    });

    assert.deepEqual(view?.origin, { kind: 'plan', turn: 1, title: 'Health aid to Nigeria' });
    assert.deepEqual(
        view?.plan?.rows.map(({ label, value }) => [label, value]),
        [
            ['Prices', 'Current prices'],
            ['Providers', 'All providers'],
        ],
    );
    assert.deepEqual(view?.plan?.others, ['c1', 'c3']);
});

test('the changes that replaced a card are listed, and a refused one is not', () => {
    const edit = (id: string, text: string) => ({
        role: 'user' as const,
        text,
        card: { title: 'Health aid' },
        edit: { card: id, row: 'unit' as const },
    });
    const view = page({
        widget: card(info(DESCRIBED), 'c1b'),
        replaced: ['c1'],
        messages: [
            { role: 'user', text: 'How much health aid?', turn: 1 },
            { role: 'bot', text: '' },
            edit('c1', 'Constant 2023 US dollars'),
            { role: 'bot', text: '' },
            edit('c9', 'Current Euros'),
            { role: 'bot', text: '' },
            edit('c1b', 'Current Euros'),
            { role: 'bot', text: '_That unit is not offered for this card._' },
        ],
    });

    assert.deepEqual(view?.changedFor, ['Constant 2023 US dollars']);
    assert.deepEqual(view?.origin, { kind: 'turn', turn: 1, question: 'How much health aid?' });
});

test('a text card has no page', () => {
    assert.equal(
        page({ widget: { kind: 'text', id: 't', title: 'Note', body: '', turn: 1 } }),
        null,
    );
});

test('a replaced card is followed to the card standing in its place', () => {
    const replaced = { c2: 'c1', c3: 'c2' };

    assert.equal(currentCardId('c1', new Set(['c3']), replaced), 'c3');
    assert.equal(currentCardId('c1', new Set(['c1']), replaced), 'c1');
    assert.equal(currentCardId('c1', new Set(['x']), replaced), null);
    assert.equal(currentCardId('a', new Set(['x']), { a: 'b', b: 'a' }), null);
    assert.deepEqual(replacedChain('c3', replaced), ['c2', 'c1']);
});
