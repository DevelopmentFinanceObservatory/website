/* eslint-disable @typescript-eslint/no-explicit-any -- reads the flattened wire Spec */
import assert from 'node:assert/strict';
import test from 'node:test';

import { flattenPartsRows, markedTotalColumns, previewCellText, previewColumns } from '../view.ts';
import { kenyaHealthPart } from './fixtures/kenya-health-series.ts';

type TablePart = { variableText: string | null; spec: any };

// The preview table's entity and axis columns, as [key, heading] pairs.
const columnsOf = (parts: TablePart[]): [string, string][] =>
    previewColumns(parts).map((column) => [column.key, column.label]);

const kenya = (): TablePart => structuredClone(kenyaHealthPart);

// The same part as an API that predates `ObservationSeries.axes` sends it.
const withoutAxes = (part: TablePart): TablePart => {
    for (const series of part.spec.observations.series) {
        delete series.axes;
    }

    return part;
};

test('previewColumns shows what tells the rows apart and hides what the Spec binds', () => {
    // Recipient (Kenya, named) and flow (bound) are the same on every row,
    // so the sentence carries them. Modality and instrument are constant but
    // unbound, so they show. Sector is bound to health but varies.
    assert.deepEqual(columnsOf([kenya()]), [
        ['entity:origin', 'Provider'],
        ['axis:crsCooperationModality', 'Modality'],
        ['axis:crsPurpose', 'Sector'],
        ['axis:crsTypeOfFinance', 'Instrument'],
    ]);

    const [first] = flattenPartsRows([kenya()]);

    assert.deepEqual(
        ['entity:origin', 'entity:destination', 'axis:crsPurpose', 'axis:crsTypeOfFinance'].map(
            (key) => previewCellText(first, key),
        ),
        ['Norway', 'Kenya', 'Health policy and administrative management', 'Standard grant'],
    );
});

test('previewColumns shows a constant column the Spec leaves open', () => {
    const part = kenya();

    part.spec.entities = [];
    part.spec.slots.find((slot: any) => slot.key.property?.ref === 'crsTypeOfFlow').binding = {
        kind: 'unbound',
    };

    assert.deepEqual(
        columnsOf([part]).map(([key]) => key),
        [
            'entity:origin',
            'entity:destination',
            'axis:crsCooperationModality',
            'axis:crsPurpose',
            'axis:crsTypeOfFinance',
            'axis:crsTypeOfFlow',
        ],
    );
});

test('previewColumns orders axes by the Spec slot order, then property dcid', () => {
    const part = kenya();
    const slots = part.spec.slots;
    const instrument = slots.findIndex(
        (slot: any) => slot.key.property?.ref === 'crsTypeOfFinance',
    );

    // Instrument comes first. Modality loses its slot, so it follows the
    // slotted axes under its property's own name.
    part.spec.slots = [
        slots[instrument],
        ...slots.filter(
            (slot: any, index: number) =>
                index !== instrument && slot.key.property?.ref !== 'crsCooperationModality',
        ),
    ];

    assert.deepEqual(columnsOf([part]).slice(1), [
        ['axis:crsTypeOfFinance', 'Instrument'],
        ['axis:crsPurpose', 'Sector'],
        ['axis:crsCooperationModality', 'Cooperation modality'],
    ]);
});

test('previewColumns falls back to the subject entity and slot labels without axes', () => {
    const part = withoutAxes(kenya());
    const rows = flattenPartsRows([part]);

    // The how slot is the unbound modality, so it has nothing to show. The
    // table keeps the first entity of each role tuple.
    assert.deepEqual(columnsOf([part]), [['entity:origin', 'Provider']]);
    assert.equal(previewCellText(rows[0], 'entity:origin'), 'Norway');
    assert.equal(previewCellText(rows[0], 'axis:crsPurpose'), '—');
});

test('previewColumns takes the union over parts, each column headed from a part with its slot', () => {
    const health = kenya();

    // The first part has no slot for instrument. The second names it.
    health.spec.slots = health.spec.slots.filter(
        (slot: any) => slot.key.property?.ref !== 'crsTypeOfFinance',
    );

    const uganda: TablePart = {
        variableText: 'education aid',
        spec: {
            slots: [
                {
                    key: {
                        axis: 'how',
                        property: { ref: 'crsTypeOfFinance' },
                        label: 'instrument',
                    },
                    binding: { kind: 'unbound' },
                },
                {
                    key: { axis: 'how', property: { ref: 'crsChannel' }, label: 'channel' },
                    binding: { kind: 'unbound' },
                },
                { key: { axis: 'where', label: 'country' }, binding: { kind: 'unbound' } },
            ],
            entities: [],
            observations: {
                series: [
                    {
                        stat_var: { ref: 'sv/education' },
                        entities: [
                            { role: 'observationAbout', ref: 'country/UGA', label: 'Uganda' },
                        ],
                        axes: [
                            {
                                property: 'crsChannel',
                                ref: 'CRSChannel11000',
                                label: 'donor government',
                            },
                            {
                                property: 'crsTypeOfFinance',
                                ref: 'CRSTypeOfFinance421',
                                label: 'standard grant',
                            },
                        ],
                        points: [{ date: '2024', value: 5 }],
                        facet: {},
                    },
                ],
            },
        },
    };
    const parts = [health, uganda];
    const rows = flattenPartsRows(parts);

    // Recipient and flow are offered by the first part only, which restates
    // them, so they stay hidden beside the second part's empty cells.
    // Instrument has no slot in the first part, so it follows that part's
    // slotted axes.
    assert.deepEqual(columnsOf(parts), [
        ['entity:origin', 'Provider'],
        ['entity:observationAbout', 'Country'],
        ['axis:crsCooperationModality', 'Modality'],
        ['axis:crsPurpose', 'Sector'],
        ['axis:crsTypeOfFinance', 'Instrument'],
        ['axis:crsChannel', 'Channel'],
    ]);

    const last = rows.at(-1)!;

    assert.equal(last.variable, 'education aid');
    assert.deepEqual(
        [
            'entity:origin',
            'entity:observationAbout',
            'axis:crsTypeOfFinance',
            'axis:crsChannel',
        ].map((key) => previewCellText(last, key)),
        ['—', 'Uganda', 'Standard grant', 'Donor government'],
    );
});

const COUNTRIES: Record<string, string> = { Kenya: 'country/KEN', Uganda: 'country/UGA' };

// A copy of the Kenya part whose recipient is `name(index)` on the series
// at `index`, named in its Spec when `named` is true.
const recipients = (name: (index: number) => string, named: boolean): TablePart => {
    const part = kenya();

    part.spec.observations.series.forEach((series: any, index: number) => {
        for (const entity of series.entities) {
            if (entity.role === 'destination') {
                Object.assign(entity, { ref: COUNTRIES[name(index)], label: name(index) });
            }
        }
    });
    part.spec.entities = named
        ? part.spec.entities.map((entity: any) =>
              entity.role === 'destination'
                  ? { ...entity, ref: COUNTRIES[name(0)], label: name(0) }
                  : entity,
          )
        : part.spec.entities.filter((entity: any) => entity.role !== 'destination');

    return part;
};

for (const { description, second, shows } of [
    {
        description: 'hides a column two parts bind to one shared value',
        second: recipients(() => 'Kenya', true),
        shows: false,
    },
    {
        description: 'shows a column one part binds and another leaves open and varying',
        second: recipients((index) => (index % 2 ? 'Kenya' : 'Uganda'), false),
        shows: true,
    },
    {
        description: 'shows a column two parts bind to different values',
        second: recipients(() => 'Uganda', true),
        shows: true,
    },
]) {
    test(`previewColumns ${description}`, () => {
        const keys = columnsOf([kenya(), second]).map(([key]) => key);

        assert.equal(keys.includes('entity:destination'), shows);
    });
}

// A copy of the Kenya part whose series all carry one sector, the first
// series' health policy sub-sector, with the Spec's sector binding set by
// `bind` and its named entities extended by `entities`.
const oneSector = (bind: (binding: any) => any, entities: any[] = []): TablePart => {
    const part = kenya();
    const sector = (series: any) => series.axes.find((axis: any) => axis.property === 'crsPurpose');
    const shown = { ...sector(part.spec.observations.series[0]) };

    for (const series of part.spec.observations.series) {
        Object.assign(sector(series), shown);
    }

    const slot = part.spec.slots.find((slot: any) => slot.key.property?.ref === 'crsPurpose');

    slot.binding = bind(slot.binding);
    part.spec.entities.push(...entities);

    return part;
};

const policy = {
    ref: { ref: 'CRSPurposeCode12110', label: 'health policy' },
    value_kind: 'enum_value',
};
const clinics = {
    ref: { ref: 'CRSPurposeCode12220', label: 'basic health care' },
    value_kind: 'enum_value',
};

for (const { description, part, key, shows } of [
    {
        description: 'shows a bound parent category whose rows all read one child code',
        part: oneSector((binding) => binding),
        key: 'axis:crsPurpose',
        shows: true,
    },
    {
        description: 'shows a bound set whose rows all read one member',
        part: oneSector(() => ({ kind: 'set', values: [policy, clinics] })),
        key: 'axis:crsPurpose',
        shows: true,
    },
    {
        description: 'hides a column bound to the one value every row reads',
        part: oneSector(() => ({ kind: 'value', value: policy })),
        key: 'axis:crsPurpose',
        shows: false,
    },
    {
        description: 'shows a role the Spec names two entities for whose rows all read one',
        part: oneSector(
            (binding) => binding,
            [{ ref: 'country/UGA', label: 'Uganda', entity_type: 'Country', role: 'destination' }],
        ),
        key: 'entity:destination',
        shows: true,
    },
]) {
    test(`previewColumns ${description}`, () => {
        const keys = columnsOf([part]).map(([column]) => column);

        assert.equal(keys.includes(key), shows);
    });
}

// A copy of the Kenya part whose origin entities carry the given party kinds,
// one per leading series (refs distinct per series).
const withOriginKinds = (kinds: (string | null)[]): TablePart => {
    const part = kenya();

    kinds.forEach((kind, index) => {
        const origin = part.spec.observations.series[index].entities.find(
            (entity: any) => entity.role === 'origin',
        );

        Object.assign(origin, { ref: `org/${index}`, label: `Donor ${index}`, party_kind: kind });
    });
    part.spec.observations.series = part.spec.observations.series.slice(0, kinds.length);

    return part;
};

const originCells = (parts: TablePart[]): string[] => {
    const marked = markedTotalColumns(parts);

    return flattenPartsRows(parts).map((row) => previewCellText(row, 'entity:origin', marked));
};

test('a total is marked only where the table holds two or more parties on its role', () => {
    const several = originCells([withOriginKinds(['party', 'party', 'total'])]);

    assert.ok(several.includes('Donor 2 (total)'));
    assert.ok(several.includes('Donor 0') && several.includes('Donor 1'));
    assert.ok(
        originCells([withOriginKinds(['party', 'residual', 'total'])]).includes('Donor 2 (total)'),
    );
    assert.ok(!several.some((text) => /\(total\)/.test(text) && !text.startsWith('Donor 2')));

    for (const kinds of [
        ['party', 'total'],
        ['residual', 'total'],
        [null, null, 'total'],
        ['party', 'party', 'residual'],
    ]) {
        const parts = [withOriginKinds(kinds)];

        assert.equal(markedTotalColumns(parts).size, 0, kinds.join());
        assert.ok(!originCells(parts).some((text) => text.endsWith('(total)')), kinds.join());
    }
});

test('parties are counted across parts, and marking leaves the other roles alone', () => {
    const first = withOriginKinds(['party', 'total']);
    const second = withOriginKinds(['party']);

    second.spec.observations.series[0].entities.find(
        (entity: any) => entity.role === 'origin',
    ).ref = 'org/other';

    assert.deepEqual([...markedTotalColumns([first])], []);
    assert.deepEqual([...markedTotalColumns([first, second])], ['entity:origin']);
    assert.ok(!originCells([first, second]).includes('Kenya (total)'));
});
