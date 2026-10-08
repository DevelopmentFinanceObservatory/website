/**
 * `cardRefMatch.ts` against recorded component revisions: a card stored
 * without `ref` gets the one revision that reproduces its title and values,
 * and a card no single revision reproduces gets none.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { CardRef, Widget } from '../../chat/widgets.ts';
import {
    asComponentRead,
    cardsWithoutRef,
    cardsWithRef,
    type ComponentRead,
    matchCardRef,
    MIN_VALIDATED,
    type ReadComponent,
    type StoredCard,
    summarise,
    validateCard,
    validationAllowsWrite,
} from '../cardRefMatch.ts';
import { reviseWidget, widgetFromComponent } from '../widgets.ts';
import type { ComponentType } from '../wire.ts';
import {
    chartReads,
    csvCharts,
    csvSameTwiceCard,
    csvStatCard,
    csvStatisticsCard,
    csvTable,
    DERIVED_FRAME,
    FRAME,
    reads,
    sameTwiceReads,
    statReads,
    tableReads,
} from './fixtures/card-ref-reads.ts';

const readerOver =
    (components: Record<string, ComponentRead[]>): ReadComponent =>
    async (componentId, revision) => {
        const revisions = components[componentId];

        return (revision === undefined ? revisions?.at(-1) : revisions?.[revision - 1]) ?? null;
    };

const read = readerOver(reads);

// A card as it is read back from `jsonb`: members set to undefined are gone.
const stored = <Card>(card: Card): Card => JSON.parse(JSON.stringify(card)) as Card;

// The card Studio holds at `revision`: created from revision 1, then revised
// by each later revision's payload, as `useChat` applies them.
const savedAt = (revisions: ComponentRead[], revision: number): StoredCard & { ref: CardRef } => {
    const [first, ...later] = revisions.slice(0, revision);
    const created = widgetFromComponent({
        event: 'component.created',
        seq: 1,
        component_id: first!.component_id,
        revision: 1,
        type: first!.stored_intent['type'] as ComponentType,
        catalog_version: first!.catalog_version,
        min_catalog_version: first!.catalog_version,
        payload: first!.resolved_payload,
        fact_summary: first!.fact_summary,
        provenance: {
            inputs: [],
            sources: [],
            freshness: {
                data_through: '2023',
                last_refreshed: '2026-09-28',
                partial_period: false,
            },
            warnings: [],
            generated_at: '2026-09-28T08:45:10Z',
            citation: 'WHO',
        },
    });
    const card = later.reduce<Widget>(
        (held, one) =>
            reviseWidget(held, {
                event: 'component.revised',
                seq: one.revision,
                component_id: one.component_id,
                revision: one.revision,
                changed: [],
                fact_summary: one.fact_summary,
                payload: one.resolved_payload,
            }),
        created!,
    );

    return stored(card) as StoredCard & { ref: CardRef };
};

test('validation recovers every distinguishable revision and never a wrong one', async () => {
    const cards = [chartReads, tableReads, statReads, sameTwiceReads].flatMap((revisions) =>
        revisions.map((one) => savedAt(revisions, one.revision)),
    );
    const results = await Promise.all(cards.map((card) => validateCard(card, read)));

    assert.deepEqual(summarise(results), { validated: 8, correct: 6, wrong: 0, unmatched: 2 });
    assert.deepEqual(
        results.flatMap(({ card, outcome }) =>
            outcome.status === 'unmatched' ? [[card.id, card.ref.revision, outcome.reason]] : [],
        ),
        [1, 2].map((revision) => [
            sameTwiceReads[0]!.component_id,
            revision,
            'several_revisions_reproduce',
        ]),
    );
});

test('validation calls a match of another revision wrong', async () => {
    const card = savedAt(chartReads, 2);
    const { verdict } = await validateCard({ ...card, ref: { ...card.ref, revision: 1 } }, read);

    assert.equal(verdict, 'wrong');
});

test('validation calls a match on another frame wrong', async () => {
    const card = savedAt(chartReads, 2);
    const frame = { ...FRAME, content_version: 'cv_another' };
    const { verdict } = await validateCard({ ...card, frame }, read);

    assert.equal(verdict, 'wrong');
});

test('a card stored with csv gets the revision that reproduces it, and its frame', async () => {
    const cases: [StoredCard, number, typeof FRAME][] = [
        // Told apart by values, then by title.
        [csvCharts[0]!, 1, FRAME],
        [csvCharts[1]!, 2, FRAME],
        [csvCharts[2]!, 3, FRAME],
        // Told apart by row order.
        [csvTable, 1, DERIVED_FRAME],
        // A stat card's csv is the fact summary's, not the payload's value.
        [csvStatCard, 1, FRAME],
    ];

    for (const [card, revision, frame] of cases) {
        assert.deepEqual(await matchCardRef(stored(card), read), {
            status: 'matched',
            ref: { component_id: card.id, revision },
            frame,
        });
    }
});

test('a card no single revision reproduces is left unmatched', async () => {
    const chart = csvCharts[1]!;
    const cases: [StoredCard, ReadComponent, string][] = [
        [csvSameTwiceCard, read, 'several_revisions_reproduce'],
        [csvStatisticsCard, read, 'statistics_csv'],
        // One digit off: values compare exactly.
        [
            { ...chart, csv: chart.csv!.replace('88.25', '88.250001') },
            read,
            'no_revision_reproduces',
        ],
        [
            { ...chart, title: 'Renamed outside any revision' } as StoredCard,
            read,
            'no_revision_reproduces',
        ],
        [{ ...chart, csv: undefined }, read, 'no_values'],
        [{ ...chart, id: 'cmp_unknown' }, read, 'component_not_found'],
        // Revision 1 is missing: the others are not enough to match on.
        [
            chart,
            (id, revision) => (revision === 1 ? Promise.resolve(null) : read(id, revision)),
            'read_failed',
        ],
        [chart, () => Promise.reject(new Error('unreachable')), 'read_failed'],
    ];

    for (const [card, reader, reason] of cases) {
        assert.deepEqual(await matchCardRef(stored(card), reader), {
            status: 'unmatched',
            reason,
        });
    }
});

test('a revision that names no frame is left unmatched', async () => {
    const [only] = statReads;
    const frameless: ComponentRead = {
        ...only!,
        stored_intent: { type: 'stat_card', title: 'Life expectancy in Nigeria' },
        resolved_payload: { ...only!.resolved_payload, provenance: { inputs: [] } },
    };
    const outcome = await matchCardRef(
        csvStatCard,
        readerOver({ [only!.component_id]: [frameless] }),
    );

    assert.deepEqual(outcome, { status: 'unmatched', reason: 'no_frame' });
});

test('only data cards are read from a stored widgets array, split by ref', () => {
    const withRef = savedAt(chartReads, 1);
    const widgets = [
        { kind: 'text', id: 'note', title: 'Note', body: 'Text' },
        csvTable,
        withRef,
        // A `ref` member of any value keeps a card out of the backfill.
        { ...csvStatCard, ref: null },
        // A card the backfill wrote has no `data`, so it is not validated.
        { ...csvCharts[1], ref: { component_id: csvCharts[1]!.id, revision: 2 }, frame: FRAME },
        'not a widget',
    ];

    assert.deepEqual(cardsWithoutRef(widgets), [{ index: 1, card: csvTable }]);
    assert.deepEqual(cardsWithRef(widgets), [withRef]);
    assert.deepEqual(cardsWithoutRef({ not: 'an array' }), []);
});

test('a read body is accepted only with every member the match reads', () => {
    const [body] = statReads;

    assert.deepEqual(asComponentRead(stored(body)), body);
    assert.equal(asComponentRead({ ...body, resolved_payload: null }), undefined);
    assert.equal(asComponentRead({ ...body, revision: '1' }), undefined);
});

test('a write needs no wrong match over enough validated cards', () => {
    const summary = { validated: MIN_VALIDATED, correct: MIN_VALIDATED, wrong: 0, unmatched: 0 };

    assert.equal(validationAllowsWrite(summary), true);
    // Unmatched cards do not refuse a write.
    assert.equal(
        validationAllowsWrite({ ...summary, correct: 1, unmatched: MIN_VALIDATED - 1 }),
        true,
    );
    assert.equal(
        validationAllowsWrite({ ...summary, correct: MIN_VALIDATED - 1, wrong: 1 }),
        false,
    );
    assert.equal(validationAllowsWrite({ ...summary, validated: MIN_VALIDATED - 1 }), false);
});
