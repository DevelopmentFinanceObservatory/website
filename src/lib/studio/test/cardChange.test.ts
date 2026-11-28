/**
 * `cardChange.ts`: which rows of a card's page carry `Change`, and where the
 * reader's last change to a row stands, read from the transcript's edit
 * turns.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { changeOffers, changeStatus, type ChangeMessage } from '../cardChange.ts';
import { widgetFromComponent } from '../widgets.ts';
import type { ComponentCreated } from '../wire.ts';

const created = JSON.parse(
    readFileSync(
        new URL('./fixtures/event-19-component-unit-change.json', import.meta.url),
        'utf8',
    ),
) as ComponentCreated;

const card = (turn = 2) => {
    const widget = widgetFromComponent(created);

    assert.ok(widget && widget.kind !== 'text');

    return { ...widget, turn };
};

test('a card with a unit offer offers a unit change from its current unit', () => {
    const offers = changeOffers(card());

    assert.deepEqual(
        offers.map(({ key, current }) => [key, current]),
        [['unit', { currency: 'USD', prices: 'constant', base_year: 2023 }]],
    );
});

test('a card without an offer, with a stale offer, or with one choice offers nothing', () => {
    const widget = card();
    const offer = widget.unitChange?.offer;

    assert.ok(offer && widget.unitChange);

    const withOffer = (next: typeof offer) => ({
        ...widget,
        unitChange: { ...widget.unitChange!, offer: next },
    });
    const usd = offer.currencies.find((currency) => currency.code === 'USD');

    assert.ok(usd);

    for (const [name, widgetCase] of [
        ['no offer', { ...widget, unitChange: undefined }],
        ['no turn', card(0)],
        // A start the offer no longer serves: the card reads another spec.
        ['stale', withOffer({ ...offer, start: { currency: 'XXX', prices: 'current' } })],
        [
            'one choice',
            withOffer({
                currencies: [{ ...usd, prices: ['current'] }],
                presets: ['USD'],
                start: { currency: 'USD', prices: 'current' },
            }),
        ],
    ] as const) {
        assert.deepEqual(changeOffers(widgetCase), [], name);
    }
});

const asked: ChangeMessage[] = [
    { role: 'user', text: 'How much health aid?' },
    { role: 'bot', text: 'Here it is.' },
];
const edit = (id: string): ChangeMessage => ({
    role: 'user',
    text: 'Current Euros',
    edit: { card: id, row: 'unit' },
});

test('a change is pending while queued or while its turn runs', () => {
    const running = [...asked, edit('c1'), { role: 'bot' as const, text: '' }];

    assert.deepEqual(
        changeStatus({ messages: running, thinking: true, cardId: 'c1', key: 'unit' }),
        { state: 'pending' },
    );
    assert.deepEqual(
        changeStatus({
            messages: asked,
            thinking: true,
            cardId: 'c1',
            key: 'unit',
            queued: [{ unit: { request: { component_id: 'c1' } } }],
        }),
        { state: 'pending' },
    );
});

test('a refused change shows the refusal on the row that asked', () => {
    const refused = [
        ...asked,
        edit('c1'),
        { role: 'bot' as const, text: '_This card no longer reads that dataset._' },
    ];

    assert.deepEqual(
        changeStatus({ messages: refused, thinking: false, cardId: 'c1', key: 'unit' }),
        { state: 'refused', detail: 'This card no longer reads that dataset.' },
    );
    assert.deepEqual(
        changeStatus({ messages: refused, thinking: false, cardId: 'c1', key: 'years' }),
        { state: 'idle' },
    );
});

test('a change that succeeded, or one to another card, leaves the row idle', () => {
    const done = [...asked, edit('c1'), { role: 'bot' as const, text: '' }];
    const other = [...asked, edit('c2'), { role: 'bot' as const, text: '' }];

    assert.deepEqual(changeStatus({ messages: done, thinking: false, cardId: 'c1', key: 'unit' }), {
        state: 'idle',
    });
    // The replacement's id names no edit turn.
    assert.deepEqual(
        changeStatus({ messages: done, thinking: false, cardId: 'c1b', key: 'unit' }),
        { state: 'idle' },
    );
    assert.deepEqual(changeStatus({ messages: other, thinking: true, cardId: 'c1', key: 'unit' }), {
        state: 'idle',
    });
    // A new question asked after the change: the change is no longer running.
    assert.deepEqual(
        changeStatus({
            messages: [...done, { role: 'user', text: 'And for Ghana?' }],
            thinking: true,
            cardId: 'c1',
            key: 'unit',
        }),
        { state: 'idle' },
    );
});
