/**
 * `cardChange.ts`: which rows of a card's page carry `Change`, and where the
 * reader's last change to a row stands, read from the transcript's edit
 * turns.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    CHANGE_REFUSALS,
    changeOffers,
    changeRefusalDetail,
    changeRefusalStale,
    changeStatus,
    type ChangeMessage,
    pickablePlaces,
    PLACE_OPTIONS_UNAVAILABLE,
    placeMatches,
    placesChange,
    placesChanged,
    roleLabel,
    yearsChange,
} from '../cardChange.ts';
import type { StreamRefusal } from '../studioClient.ts';
import { widgetFromComponent } from '../widgets.ts';
import type { CardChanges, ComponentCreated, ToolError, TurnRequest } from '../wire.ts';

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
        offers.map((offer) => [offer.key, offer.key === 'unit' ? offer.current : null]),
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
        // A start the offer does not serve: the card reads another spec.
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
    // The card that replaced c1 shows a change asked of c1, running or
    // queued, as its own.
    assert.deepEqual(
        [
            changeStatus({
                messages: running,
                thinking: true,
                cardId: 'c1b',
                key: 'unit',
                replaced: ['c1'],
            }),
            changeStatus({
                messages: asked,
                thinking: true,
                cardId: 'c1b',
                key: 'years',
                replaced: ['c1'],
                queued: [{ change: { row: 'years', request: { component_id: 'c1' } } }],
            }),
        ],
        [{ state: 'pending' }, { state: 'pending' }],
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
    // A refusal stays with the card refused, and a change the queue dropped
    // shows on the standing card's row.
    assert.deepEqual(
        [
            changeStatus({
                messages: refused,
                thinking: false,
                cardId: 'c1b',
                key: 'unit',
                replaced: ['c1'],
            }),
            changeStatus({
                messages: refused,
                thinking: false,
                cardId: 'c1b',
                key: 'years',
                replaced: ['c1'],
                dropped: [{ card: 'c1b', row: 'years', detail: 'Gone.' }],
            }),
        ],
        [{ state: 'idle' }, { state: 'refused', detail: 'Gone.' }],
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

// The harness's card frame (`event-06`), with the years and places offer of
// the `card_changes` shape: places are read on demand, so an offer
// names its role, whether it takes several, and the places shown.
const plain = JSON.parse(
    readFileSync(new URL('./fixtures/event-06-component-created.json', import.meta.url), 'utf8'),
) as ComponentCreated;
const SPEC = 'spec_8f3a1c5e9d2b4a7c6e0f1a2b3c4d5e6f';
const changes = (overrides: Partial<CardChanges> = {}): CardChanges => ({
    spec_id: SPEC,
    window: {
        start_year: 2016,
        end_year: 2024,
        first_year: 1990,
        last_year: 2024,
        missing_years: [1991, 1992],
    },
    places: [
        {
            role: 'destination',
            multiple: false,
            chosen: [{ id: 'country/ETH', label: 'Ethiopia' }],
        },
        {
            role: 'origin',
            multiple: true,
            chosen: [
                { id: 'country/FRA', label: 'France' },
                { id: 'country/DEU', label: 'Germany' },
            ],
        },
    ],
    ...overrides,
});
const plainChosen = [{ id: 'country/ETH', label: 'Ethiopia' }];
const changeable = (cardChanges: CardChanges = changes()) => {
    const widget = widgetFromComponent({ ...plain, card_changes: cardChanges });

    assert.ok(widget && widget.kind !== 'text');

    return { ...widget, turn: 1 };
};

test('a malformed part of a card’s offers is dropped, and the other parts stand', () => {
    const window = changes().window!;
    const [destination, origin] = changes().places!;
    const offered = (cardChanges: unknown) => {
        const widget = widgetFromComponent({
            ...plain,
            card_changes: cardChanges as CardChanges,
        });

        assert.ok(widget && widget.kind !== 'text');

        return changeOffers({ ...widget, turn: 1 }).map((offer) => offer.id);
    };
    const all = ['years', 'shows:destination', 'shows:origin'];

    assert.deepEqual(offered(changes()), all);

    for (const [name, cardChanges, ids] of [
        [
            'a year that is not whole',
            changes({ window: { ...window, first_year: 1990.5 } }),
            all.slice(1),
        ],
        ['a year past 2200', changes({ window: { ...window, last_year: 9999 } }), all.slice(1)],
        ['a year before 1900', changes({ window: { ...window, first_year: 1800 } }), all.slice(1)],
        [
            'a first year after the last',
            changes({ window: { ...window, first_year: 2025 } }),
            all.slice(1),
        ],
        [
            'a drawn year outside the data',
            changes({ window: { ...window, end_year: 2025 } }),
            all.slice(1),
        ],
        [
            'one value per series over a range of years',
            changes({ window: { ...window, single: true } }),
            all.slice(1),
        ],
        // A card whose places came from a cut (the largest in a year) offers
        // its places and no years.
        ['no window', changes({ window: undefined }), all.slice(1)],
        [
            'missing years that are not a list',
            changes({ window: { ...window, missing_years: { 1991: true } } as never }),
            all.slice(1),
        ],
        [
            'a missing year that is not whole',
            changes({ window: { ...window, missing_years: ['1991'] } as never }),
            all.slice(1),
        ],
        [
            'a role that is not a string',
            changes({ places: [{ ...destination!, role: 7 } as never, origin!] }),
            ['years', 'shows:origin'],
        ],
        [
            'multiple that is not a boolean',
            changes({ places: [{ ...destination!, multiple: 'yes' } as never, origin!] }),
            ['years', 'shows:origin'],
        ],
        [
            'no chosen places list',
            changes({ places: [{ role: 'destination', multiple: false } as never, origin!] }),
            ['years', 'shows:origin'],
        ],
        [
            'a chosen place without a label',
            changes({
                places: [destination!, { ...origin!, chosen: [{ id: 'country/FRA' }] } as never],
            }),
            ['years', 'shows:destination'],
        ],
        ['places that are not a list', changes({ places: 'origin' as never }), ['years']],
        ['no spec id', { ...changes(), spec_id: 3 }, []],
    ] as const) {
        assert.deepEqual(offered(cardChanges), ids, name);
    }

    // `single` is kept only as `true`.
    const single = (value: unknown) =>
        changeOffers(
            changeable(
                changes({
                    window: { ...window, start_year: 2024, end_year: 2024, single: value } as never,
                }),
            ),
        ).flatMap((offer) => (offer.key === 'years' ? [offer.window.single ?? null] : []));

    assert.deepEqual([single(true), single('yes')], [[true], [null]]);
});

test('a card offers its years and one places row per role, labelled from the role', () => {
    const offers = changeOffers(changeable());

    assert.deepEqual(
        offers.map((offer) =>
            offer.key === 'shows'
                ? [
                      offer.id,
                      offer.role,
                      offer.multiple,
                      offer.label === roleLabel(offer.role, offer.multiple),
                  ]
                : [offer.id],
        ),
        [
            ['years'],
            ['shows:destination', 'destination', false, true],
            ['shows:origin', 'origin', true, true],
        ],
    );

    const other = changeOffers(
        changeable(
            changes({
                window: null,
                places: [{ role: 'observationAbout', multiple: false, chosen: plainChosen }],
            }),
        ),
    );
    const [label] = other.map((offer) => (offer.key === 'shows' ? offer.label : ''));

    // Every role outside the named ones has the same, non-empty label.
    assert.ok(label);
    assert.equal(label, roleLabel('anotherRole', false));
    assert.notEqual(label, roleLabel('origin', false));
});

test('a years offer needs a range other than the one drawn', () => {
    const only = (window: NonNullable<CardChanges['window']>) =>
        changeOffers(changeable(changes({ window, places: null }))).map((offer) => offer.key);

    // 2024 is the only year with data, and the card draws it.
    assert.deepEqual(
        only({
            start_year: 2024,
            end_year: 2024,
            first_year: 2023,
            last_year: 2024,
            missing_years: [2023],
        }),
        [],
    );
    // A card of one year can move to another, or widen to both.
    assert.deepEqual(
        only({ start_year: 2023, end_year: 2023, first_year: 2023, last_year: 2024 }),
        ['years'],
    );
});

test('yearsChange builds the harness fixture request and refuses a range the offer does not take', () => {
    const request = JSON.parse(
        readFileSync(
            new URL('./fixtures/request-22-turn-apply-change-window.json', import.meta.url),
            'utf8',
        ),
    ) as TurnRequest;
    const card = changeable(
        changes({
            window: { start_year: 2016, end_year: 2024, first_year: 1990, last_year: 2024 },
        }),
    );

    assert.deepEqual(yearsChange(card, 'Aid', 2010, 2024)?.request, request.apply_change);

    const gappy = changeable();

    for (const [from, to] of [
        [1991, 2024],
        [2000, 1992],
        [1992, 1992],
        [2010, 2030],
    ] as const) {
        assert.equal(yearsChange(gappy, 'Aid', from, to), null, `${from} to ${to}`);
    }

    // One year is a range: a card of 2023 moves to 2020, as the harness takes it.
    assert.deepEqual(
        [
            yearsChange(gappy, 'Aid', 2020, 2020)?.request.change,
            yearsChange(gappy, 'Aid', 2020, 2020)?.words,
        ],
        [{ kind: 'window', start_year: 2020, end_year: 2020 }, '2020'],
    );
});

test('a key number changes to one year: offered while another year has data, sent as both ends', () => {
    const single = (window: Omit<NonNullable<CardChanges['window']>, 'single'>) =>
        changeable(changes({ window: { ...window, single: true }, places: null }));
    const keyNumber = single({
        start_year: 2023,
        end_year: 2023,
        first_year: 2018,
        last_year: 2024,
        missing_years: [2019],
    });

    // The only year with data, which the card draws, leaves nothing to change to.
    assert.deepEqual(
        changeOffers(
            single({
                start_year: 2024,
                end_year: 2024,
                first_year: 2023,
                last_year: 2024,
                missing_years: [2023],
            }),
        ),
        [],
    );
    assert.deepEqual(
        changeOffers(keyNumber).map((offer) => offer.key),
        ['years'],
    );
    assert.deepEqual(yearsChange(keyNumber, 'Aid', 2020, 2020)?.request.change, {
        kind: 'window',
        start_year: 2020,
        end_year: 2020,
    });

    for (const [from, to] of [
        [2018, 2020],
        [2019, 2019],
        [2010, 2010],
    ] as const) {
        assert.equal(yearsChange(keyNumber, 'Aid', from, to), null, `${from} to ${to}`);
    }
});

test('placesChange names the role and the ids, one place for a role that takes one', () => {
    const card = changeable();
    const uganda = { id: 'country/UGA', label: 'Uganda' };
    const kenya = { id: 'country/KEN', label: 'Kenya' };

    assert.deepEqual(placesChange(card, 'Aid', 'destination', [uganda])?.request, {
        component_id: plain.component_id,
        spec_id: SPEC,
        change: { kind: 'places', role: 'destination', entities: ['country/UGA'] },
    });
    assert.deepEqual(placesChange(card, 'Aid', 'origin', [uganda, kenya])?.request.change, {
        kind: 'places',
        role: 'origin',
        entities: ['country/UGA', 'country/KEN'],
    });
    assert.equal(placesChange(card, 'Aid', 'destination', [uganda, kenya]), null);
    assert.equal(placesChange(card, 'Aid', 'destination', []), null);
    assert.equal(placesChange(card, 'Aid', 'observationAbout', [uganda]), null);
});

const refusal = (status: number, error: Partial<ToolError> | null): StreamRefusal => ({
    status,
    detail: error?.detail ?? null,
    error: error && {
        error: 'constraint_violation',
        retry: 'do_not_retry',
        detail: 'Refused.',
        ...error,
    },
});

test('the harness refusals of a change give their detail, and only a stale one clears the offer', () => {
    for (const code of CHANGE_REFUSALS) {
        const refused = refusal(422, { constraint_id: code, pointer: '/apply_change' });

        assert.equal(changeRefusalDetail(refused), 'Refused.', code);
        assert.equal(changeRefusalStale(refused), code === 'scope_choice_stale', code);
    }

    const unavailable = refusal(503, {
        error: 'transient_unavailable',
        retry: 'retry_after_delay',
        constraint_id: PLACE_OPTIONS_UNAVAILABLE,
    });

    assert.equal(changeRefusalDetail(unavailable), 'Refused.');
    assert.equal(changeRefusalStale(unavailable), false);
    // A deployment that cannot list places refuses a places change the same
    // way on the turn route.
    assert.equal(
        changeRefusalDetail(
            refusal(503, { error: 'capability_unavailable', retry: 'do_not_retry' }),
        ),
        'Refused.',
    );

    for (const other of [
        refusal(422, { constraint_id: 'scope_choice_stale', pointer: '/apply_unit' }),
        refusal(503, { error: 'transient_unavailable', retry: 'retry_after_delay' }),
        refusal(409, { constraint_id: 'scope_choice_stale', pointer: '/apply_change' }),
        refusal(500, null),
    ]) {
        assert.equal(changeRefusalDetail(other), null);
    }
});

test('a places change is pending and refused on its own role only', () => {
    const shows = (role: string): ChangeMessage => ({
        role: 'user',
        text: 'Uganda',
        edit: { card: 'c1', row: 'shows', role },
    });
    const refused = [
        ...asked,
        shows('destination'),
        { role: 'bot' as const, text: '_No figures for Uganda._' },
    ];
    const status = (role: string) =>
        changeStatus({ messages: refused, thinking: false, cardId: 'c1', key: 'shows', role });

    assert.deepEqual(status('destination'), { state: 'refused', detail: 'No figures for Uganda.' });
    assert.deepEqual(status('origin'), { state: 'idle' });
    assert.deepEqual(
        changeStatus({
            messages: asked,
            thinking: true,
            cardId: 'c1',
            key: 'shows',
            role: 'origin',
            queued: [{ change: { row: 'shows', role: 'origin', request: { component_id: 'c1' } } }],
        }),
        { state: 'pending' },
    );
    assert.deepEqual(
        changeStatus({
            messages: asked,
            thinking: true,
            cardId: 'c1',
            key: 'shows',
            role: 'destination',
            queued: [{ change: { row: 'shows', role: 'origin', request: { component_id: 'c1' } } }],
        }),
        { state: 'idle' },
    );
});

test('the places picker lists the shown places first, each place once, and matches by label', () => {
    const shown = [{ id: 'country/ETH', label: 'Ethiopia' }];
    const listed = pickablePlaces(shown, [
        { id: 'country/KEN', label: 'Kenya' },
        { id: 'country/ETH', label: 'Ethiopia' },
    ]);

    assert.deepEqual(
        listed.map((place) => place.id),
        ['country/ETH', 'country/KEN'],
    );
    assert.deepEqual(
        listed.filter((place) => placeMatches(place, ' ken ')).map((place) => place.id),
        ['country/KEN'],
    );
    assert.equal(placesChanged(shown, [{ id: 'country/ETH', label: 'Ethiopia' }]), false);
    assert.equal(placesChanged(shown, listed), true);
});

test('the harness card frame with card_changes offers one year and its place, and builds the fixture places request', () => {
    const read = (name: string): unknown =>
        JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
    const widget = widgetFromComponent(
        read('event-23-component-card-changes.json') as ComponentCreated,
    );
    const request = read('request-23-turn-apply-change-places.json') as TurnRequest;

    assert.ok(widget && widget.kind !== 'text');

    const card = { ...widget, turn: 1 };

    assert.deepEqual(
        changeOffers(card).map((offer) => offer.id),
        ['unit', 'years', 'shows:observationAbout'],
    );
    assert.deepEqual(
        placesChange(card, 'Debt service', 'observationAbout', [
            { id: 'country/KEN', label: 'Kenya' },
        ])?.request,
        request.apply_change,
    );
    // A key number (`single`) drawn for 2023 changes to one year with data:
    // 1991 holds none, and a range is refused.
    assert.equal(yearsChange(card, 'Debt service', 1991, 1991), null);
    assert.equal(yearsChange(card, 'Debt service', 1990, 2024), null);
    assert.deepEqual(yearsChange(card, 'Debt service', 1990, 1990)?.request.change, {
        kind: 'window',
        start_year: 1990,
        end_year: 1990,
    });
});
