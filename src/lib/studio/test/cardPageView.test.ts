/**
 * `cardPageView.ts`: the card page's sections for a described card, a
 * computed card, a card with no description and a plan card, and how the page
 * finds the card standing in a replaced card's place.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { CardInfo, KeyNumberWidget, Widget } from '../../chat/widgets.ts';
import type { ChangeOffer } from '../cardChange.ts';
import { cardPageView, type CardPageInput } from '../cardPageView.ts';
import type { CardHistory } from '../cardReplace.ts';
import { approvedFromFrame, type ApprovedPlan } from '../plan.ts';
import type { PlanApproved } from '../wire.ts';

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

test('a described card keys its rows years, unit, shows, counts, then within', () => {
    const counted = structuredClone(DESCRIBED);

    counted.about.drawn.dimensions.push({
        property: { ref: 'financingProvider', label: 'provider' },
        count: 63,
        of: 63,
    });

    const view = page({ widget: card(info(counted)) });

    assert.deepEqual(keys(view), ['years', 'unit', 'shows', 'count:Providers', 'within']);
    assert.equal(view?.measures[1]?.value, 'US dollars, current prices');
    // The recipient the card is fixed to, which carries no definition.
    assert.equal(view?.measures[4]?.value, 'recipient: Nigeria');
    // A measure without a definition still names the measure.
    assert.deepEqual(view?.measure, { label: 'Gross disbursements', definition: null });
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

test('each source row opens the source page the session lists it under', () => {
    const source = {
        id: 'dcid:OECD_CRS',
        name: 'OECD CRS',
        licence: null,
        url: null,
        retrieved: null,
    };
    const keysOf = (cardInfo: CardInfo) =>
        page({ widget: card(cardInfo) })?.sourceRows.map((row) => row.key);
    const described = page({ widget: card(info(DESCRIBED)) });

    assert.deepEqual(
        described?.sourceRows.map((row) => row.key),
        described?.sources.map((entry) => entry.page ?? entry.name),
    );
    assert.deepEqual(keysOf(info(undefined, { sources: [source] })), ['dcid:OECD_CRS']);
    // A card whose one source is its own `sourceId` opens under that id.
    assert.deepEqual(
        keysOf(info(undefined, { sourceId: 'dcid:OECD_CRS', sourceName: 'OECD CRS' })),
        ['dcid:OECD_CRS'],
    );
    // `data_through` is the last year served: a card drawn to end before its
    // data does reads the last year its data holds, and a changed card with
    // no window to read shows none.
    const sourced = info(undefined, { sources: [source], dataThrough: '2015' });
    const keyNumber = (extra: Partial<KeyNumberWidget> & CardHistory = {}) => ({
        kind: 'key_number' as const,
        id: 'c1',
        label: 'Health aid',
        value: '1',
        info: sourced,
        turn: 1,
        ...extra,
    });
    const window = (end: number) => ({
        spec_id: 's1',
        window: { start_year: 2000, end_year: end, first_year: 1990, last_year: 2025 },
    });
    const rows: [CardPageInput['widget'], string | undefined][] = [
        [keyNumber(), 'data through 2015'],
        [keyNumber({ cardChanges: window(2015) }), 'data through 2025'],
        [
            keyNumber({ cardChanges: window(2025), info: { ...sourced, dataThrough: '2025' } }),
            'data through 2025',
        ],
        [keyNumber({ changedIn: [2] }), undefined],
    ];

    for (const [widget, through] of rows) {
        assert.equal(page({ widget })?.sourceRows[0]?.through ?? undefined, through);
    }
});

test('a source row reads how far the data runs and the licence, each only when known', () => {
    const metaOf = (cardInfo: CardInfo) =>
        page({ widget: card(cardInfo) })?.sourceRows.map((row) => row.meta);
    const source = { id: 'dcid:CRS', name: 'OECD CRS', licence: null, url: null, retrieved: null };

    assert.deepEqual(metaOf(info(DESCRIBED, { dataThrough: '2024' })), [
        'data through 2024 · OECD Terms and Conditions',
    ]);
    assert.deepEqual(metaOf(info(DESCRIBED)), ['OECD Terms and Conditions']);
    assert.deepEqual(metaOf(info(undefined, { sources: [source] })), [null]);
});

test('a plan card linked by its turn names its plan, lists every choice and its siblings', () => {
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
        plan: {
            link: { turn: 1, title: approved.title, cards: ['c1', 'c2', 'c3'], stepId: null },
            approved,
        },
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

test('the changes that drew a card of its chain are listed, and a refused one is not', () => {
    const edit = (id: string, text: string, turn: number) => ({
        role: 'user' as const,
        text,
        turn,
        card: { title: 'Health aid' },
        edit: { card: id, row: 'unit' as const },
    });
    const messages = [
        { role: 'user' as const, text: 'How much health aid?', turn: 1 },
        { role: 'bot' as const, text: '' },
        edit('c1', 'Current Euros', 2),
        { role: 'bot' as const, text: '_That unit is not offered for this card._' },
        edit('c1', 'Constant 2023 US dollars', 3),
        { role: 'bot' as const, text: '' },
        edit('c1b', 'Start it in 2012', 4),
        { role: 'bot' as const, text: '' },
    ];

    for (const [changedIn, listed] of [
        [[3], ['Constant 2023 US dollars']],
        [
            [3, 4],
            ['Constant 2023 US dollars', 'Start it in 2012'],
        ],
        [undefined, []],
    ] as const) {
        const view = page({
            widget: {
                ...card(info(DESCRIBED), 'c1c'),
                ...(changedIn && { changedIn: [...changedIn] }),
            },
            messages,
        });

        assert.deepEqual(view?.changedFor, listed);
        assert.deepEqual(view?.origin, { kind: 'turn', turn: 1, question: 'How much health aid?' });
    }
});

test('a text card has no page', () => {
    assert.equal(
        page({ widget: { kind: 'text', id: 't', title: 'Note', body: '', turn: 1 } }),
        null,
    );
});

// The harness's approved plan (`event-16`): `Basis` shapes steps s2 and s3,
// `Prices` every step.
const approvedFixture = approvedFromFrame(
    JSON.parse(
        readFileSync(new URL('./fixtures/event-16-plan-approved.json', import.meta.url), 'utf8'),
    ) as PlanApproved,
);

test('Set by the plan lists the choices of the card’s step, less those a card row shows', () => {
    const rows = (approved: ApprovedPlan, stepId: string | null, offers: ChangeOffer[] = []) =>
        page({
            widget: card(info(DESCRIBED)),
            plan: { link: { turn: 1, title: approved.title, cards: ['c1'], stepId }, approved },
            offers,
        })?.plan?.rows.map((row) => row.label);
    const withKinds: ApprovedPlan = {
        ...approvedFixture,
        choices: approvedFixture.choices.map((choice) => ({
            ...choice,
            kind: choice.question === 'Prices' ? ('unit' as const) : ('measure_basis' as const),
        })),
    };
    const unnamed: ApprovedPlan = {
        ...approvedFixture,
        choices: approvedFixture.choices.map((choice) => ({ ...choice, step_ids: null })),
    };
    const places: ApprovedPlan = {
        ...approvedFixture,
        choices: [{ question: 'Recipients', chosen: 'Kenya', kind: 'places', step_ids: ['s1'] }],
    };
    const counted: ApprovedPlan = {
        ...approvedFixture,
        choices: [
            {
                question: 'Count by',
                chosen: 'gross disbursements, current USD',
                kind: 'count',
                step_ids: ['s1'],
            },
        ],
    };
    const window: ApprovedPlan = {
        ...approvedFixture,
        choices: [{ question: 'Years', chosen: '2010 to 2024', kind: 'window', step_ids: ['s1'] }],
    };
    const shows: ChangeOffer = {
        key: 'shows',
        id: 'shows:destination',
        specId: 'spec_1',
        role: 'destination',
        label: 'Recipient',
        multiple: false,
        max: 1,
        chosen: [{ id: 'country/KEN', label: 'Kenya' }],
    };

    for (const [name, approved, stepId, offers, expected] of [
        ['step s1', approvedFixture, 's1', [], ['Prices']],
        ['step s3', approvedFixture, 's3', [], ['Basis', 'Prices']],
        ['no step on the card', approvedFixture, null, [], ['Basis', 'Prices']],
        ['no steps on the choices', unnamed, 's1', [], ['Basis', 'Prices']],
        // The card's Unit row shows the unit choice already.
        ['unit kind', withKinds, 's3', [], ['Basis']],
        // The card's Years row shows the window choice already.
        ['window kind', window, 's1', [], []],
        // How the flows are counted is the measure line the page shows.
        ['count kind', counted, 's1', [], []],
        // A places choice drops beside a places row, and only beside one.
        ['places kind with a places row', places, 's1', [shows], []],
        ['places kind without one', places, 's1', [], ['Recipients']],
    ] as const) {
        assert.deepEqual(rows(approved, stepId, [...offers]), expected, name);
    }
});

test('an offer rides on the row it changes, or on a row of its own', () => {
    const years: ChangeOffer = {
        key: 'years',
        id: 'years',
        specId: 'spec_1',
        window: { start_year: 2010, end_year: 2024, first_year: 1990, last_year: 2024 },
    };
    const shows: ChangeOffer = {
        key: 'shows',
        id: 'shows:destination',
        specId: 'spec_1',
        role: 'destination',
        label: 'Recipient',
        multiple: false,
        max: 1,
        chosen: [{ id: 'country/KEN', label: 'Kenya' }],
    };
    const view = page({ widget: card(info(DESCRIBED)), offers: [years, shows] });
    const changed = view?.measures.filter((row) => row.offer);
    // A card offering neither years nor places keeps its own rows, with no
    // row of an offer and no Change.
    const none = page({ widget: card(info(DESCRIBED)), offers: [] });

    assert.ok(none?.measures.length);
    assert.ok(none.measures.every((row) => row.offer === null));

    assert.deepEqual(
        changed?.map((row) => [row.key, row.label, row.value]),
        [
            ['years', view?.measures[0]?.label, view?.measures[0]?.value],
            ['shows:destination', 'Recipient', 'Kenya'],
        ],
    );

    // A `Shows` places row beside the card's own `Shows` list is `Place`.
    const place = { ...shows, id: 'shows:observationAbout', label: 'Shows' };
    const beside = page({ widget: card(info(DESCRIBED)), offers: [place] });

    assert.deepEqual(
        beside?.measures.filter((row) => row.key.startsWith('shows')).map((row) => row.label),
        ['Shows', 'Place'],
    );
});

test('a property the service leaves as its key shows its value alone, and a single-year offer reads Year', () => {
    const raw = structuredClone(DESCRIBED) as unknown as {
        about: { fixed: { property: { label: string } }[] };
    };

    raw.about.fixed[0]!.property.label = 'observationAbout';

    const view = page({
        widget: card(info(raw)),
        offers: [
            {
                key: 'years',
                id: 'years',
                specId: 'spec_1',
                window: {
                    start_year: 2024,
                    end_year: 2024,
                    first_year: 2010,
                    last_year: 2024,
                    single: true,
                },
            },
        ],
    });

    assert.equal(view?.measures.find((row) => row.key === 'within')?.value, 'Nigeria');
    assert.equal(view?.measures.find((row) => row.key === 'years')?.label, 'Year');
});

test('Within leaves out the places a places row shows, and keeps the rest', () => {
    // The live debt card's description and places offer: fixed to Kenya as
    // its debtor, which its places row names.
    const debtor = {
        property: { ref: 'financingRecipient', label: 'debtor' },
        value: { ref: 'country/KEN', label: 'Kenya' },
    };
    const sector = {
        property: { ref: 'crsPurpose', label: 'sector' },
        value: { ref: 'CRSPurposeCode12220', label: 'basic health care' },
    };
    const described = (fixed: unknown[]) => {
        const description = structuredClone(DESCRIBED) as unknown as {
            about: { fixed: unknown[] };
        };

        description.about.fixed = fixed;

        return description;
    };
    const kenya: ChangeOffer = {
        key: 'shows',
        id: 'shows:destination',
        specId: 'spec_1',
        role: 'destination',
        label: 'Debtors',
        multiple: true,
        max: 8,
        chosen: [{ id: 'country/KEN', label: 'Kenya' }],
    };
    const uganda = { ...kenya, chosen: [{ id: 'country/UGA', label: 'Uganda' }] };
    const origin = { ...kenya, id: 'shows:origin', role: 'origin' };

    for (const [fixed, offers, within] of [
        [[debtor], [kenya], null],
        [[debtor, sector], [kenya], 'sector: basic health care'],
        // Another place, or another role, than the row shows.
        [[debtor], [uganda], 'debtor: Kenya'],
        [[debtor], [origin], 'debtor: Kenya'],
        // No places row: Within as it is.
        [[debtor], [], 'debtor: Kenya'],
    ] as const) {
        const view = page({ widget: card(info(described([...fixed]))), offers: [...offers] });

        assert.equal(
            view?.measures.find((row) => row.key === 'within')?.value ?? null,
            within,
            JSON.stringify([fixed, offers.map((offer) => offer.id)]),
        );
    }
});
