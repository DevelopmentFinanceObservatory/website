/** Pure logic behind the measure token's "Select Measure" menu and the
 *  byline's unit menu: the alternatives and slot groups each offers, the
 *  identity entry a pick posts, and the note lines a varying open axis with
 *  no menu contributes. */

import type { GraphNode } from '../graph/wire.ts';

import { specEntityGroups } from './datasetEntries.ts';
import { keyRef } from './searchClient.ts';
import { priceBasis } from './unitLabel.ts';
import type {
    DatasetIdentityEntry,
    GraphRef,
    MeasureAxisValue,
    RelatedMeasure,
    Slot,
    Spec,
    SpecAlternativeMeasure,
} from './types.ts';
import {
    openAxisFactLabel,
    slotOffersChoice,
    slotOptionsEntry,
    type SlotOptionsEntry,
} from './view.ts';

export { openAxisFactLabel };

export type MeasureMenuSpec = Pick<
    Spec,
    'spec_id' | 'slots' | 'alternative_measures' | 'open_axis_facts' | 'download'
>;

/** One group of the measure menu: a slot the measure token states, with
 *  its options. */
export interface MeasureSlotGroup {
    slot: Slot;
    slotIndex: number;
    entry: SlotOptionsEntry;
}

/** The slots the measure token states (`states`, its SentenceToken.states)
 *  whose menus offer something other than their current value, in the
 *  token's order: the measure menu's groups ("flow" under "gross ODA
 *  disbursements"). A stated slot with nothing else to pick adds none. */
export function measureSlotGroups(
    spec: MeasureMenuSpec,
    states: readonly string[],
    optionsBySpec: Record<string, Record<string, SlotOptionsEntry>>,
): MeasureSlotGroup[] {
    const slots = spec.slots ?? [];

    return states.flatMap((ref) => {
        const slotIndex = slots.findIndex((slot) => keyRef(slot.key) === ref);
        if (slotIndex === -1) return [];

        const slot = slots[slotIndex];
        const entry = slotOptionsEntry(optionsBySpec, spec.spec_id, ref);

        return slotOffersChoice(slot, entry, spec) ? [{ slot, slotIndex, entry }] : [];
    });
}

/** The refs the measure token's menu changes: each group's slot, and,
 *  when the menu switches the measure (`switchesMeasure`), the refs the
 *  token states (`states`) that no slot of `spec` carries, the measure's
 *  own axes ("axis:measuredProperty"). A stated slot with no group is
 *  left out, since the menu offers no choice for it. */
export function measureMenuRefs(
    spec: Pick<MeasureMenuSpec, 'slots'>,
    states: readonly string[],
    groups: readonly MeasureSlotGroup[],
    switchesMeasure: boolean,
): string[] {
    const slotRefs = new Set((spec.slots ?? []).map((slot) => keyRef(slot.key)));
    const own = switchesMeasure ? states.filter((ref) => !slotRefs.has(ref)) : [];

    return [...own, ...groups.map(({ slot }) => keyRef(slot.key))];
}

/** The alternatives the measure token's menu offers: the 'what' entries,
 *  each a different measure. */
export function measureAlternatives(
    spec: Pick<MeasureMenuSpec, 'alternative_measures'>,
): SpecAlternativeMeasure[] {
    return (spec.alternative_measures ?? []).filter((alternative) => alternative.axis === 'what');
}

/** The alternatives the byline's unit token offers: the 'unit' entries,
 *  the same measure at another price basis. A pick posts
 *  `measureSwitchEntry`, the same resubmit as a measure switch. */
export function unitAlternatives(
    spec: Pick<MeasureMenuSpec, 'alternative_measures'>,
): SpecAlternativeMeasure[] {
    return (spec.alternative_measures ?? []).filter((alternative) => alternative.axis === 'unit');
}

/** A measure switch on one part: the alternative or related measure that
 *  part's resubmit posts (`measureSwitchEntry`). */
export interface MeasurePick {
    partIndex: number;
    measure: SpecAlternativeMeasure | RelatedMeasure;
}

/** One row of the unit menu's price-basis switch: the first part's
 *  alternative, which the row shows, and the switch each part makes. */
export interface UnitSwitch {
    measure: SpecAlternativeMeasure;
    picks: MeasurePick[];
}

const priceBasisKey = (alternative: SpecAlternativeMeasure): string | null => {
    const basis = priceBasis(alternative);

    return basis ? `${basis.prices}:${basis.baseYear ?? ''}` : null;
};

/** The unit token's price-basis switches when the answer offers no
 *  conversion: each of the first part's unit alternatives, and for every
 *  other part the token speaks for (a byline unit the parts share), its own
 *  alternative at the same price basis (`priceBasis`). A basis some part
 *  lacks is left out, so a pick switches every part. */
export function unitSwitches(
    parts: readonly { index: number; spec: Pick<MeasureMenuSpec, 'alternative_measures'> }[],
): UnitSwitch[] {
    const [first, ...rest] = parts;

    if (!first) return [];

    return unitAlternatives(first.spec).flatMap((measure) => {
        const basis = rest.length > 0 ? priceBasisKey(measure) : null;
        const picks: MeasurePick[] = [{ partIndex: first.index, measure }];

        for (const part of rest) {
            const own = unitAlternatives(part.spec).find(
                (other) => basis !== null && priceBasisKey(other) === basis,
            );

            if (!own) return [];

            picks.push({ partIndex: part.index, measure: own });
        }

        return [{ measure, picks }];
    });
}

/** One line per varying open axis the reader cannot pick from: no slot
 *  carries it, or its slot has no options. */
export function measureVarianceNotes(
    spec: MeasureMenuSpec,
    optionsBySpec: Record<string, Record<string, SlotOptionsEntry>>,
): string[] {
    const slots = spec.slots ?? [];

    return (spec.open_axis_facts ?? []).flatMap((fact) => {
        if (!fact.varies) return [];

        const slot = slots.find((s) => s.key.property?.ref === fact.property);
        const pickable =
            slot != null &&
            slotOptionsEntry(optionsBySpec, spec.spec_id, keyRef(slot.key)).options.length > 0;
        const label = slot?.key.label ?? openAxisFactLabel(fact.property);

        return pickable ? [] : [`Results vary by ${label} (${fact.distinct_count} values)`];
    });
}

/** The resubmit entry a pick in the measure menu posts: the alternative's
 *  or related measure's own identity, from which the API resolves the
 *  membership, and the named groups of `spec`, the Spec whose menu offered
 *  the measure. */
export function measureSwitchEntry(
    variableText: string,
    measure: Pick<SpecAlternativeMeasure | RelatedMeasure, 'definition'>,
    spec: Pick<Spec, 'entity_groups'> | null | undefined,
): DatasetIdentityEntry {
    return {
        entry_kind: 'identity',
        variable_text: variableText,
        identity: measure.definition.identity,
        ...specEntityGroups(spec),
    };
}

const axisValueKey = ({ axis, value }: MeasureAxisValue) => `${axis}=${value.ref}`;

/** The values a measure row's info icon defines: those of the row's own
 *  `measure_axis_values` that some other row in the menu does not share
 *  (Gross against Net, Disbursement against Commitment), so a value every
 *  row holds (Nominal) is not repeated on each. With no other row, or none
 *  that differs, every value. */
export function measureDefinitionValues(
    values: MeasureAxisValue[] | null | undefined,
    otherRows: (MeasureAxisValue[] | null | undefined)[],
): GraphRef[] {
    const own = values ?? [];
    const others = otherRows.map((row) => new Set((row ?? []).map(axisValueKey)));
    const distinct = own.filter((value) => others.some((row) => !row.has(axisValueKey(value))));

    return (distinct.length > 0 ? distinct : own).map(({ value }) => value);
}

/** A graph node's own prose, from the batch door: its `description`. Null
 *  when the graph holds no node or the node has no description, which hides
 *  the info icon. */
export function graphNodeDescription(node: GraphNode | null): string | null {
    return node?.description?.trim() ? node.description : null;
}

/** The measures related to a measure token with no alternatives: the
 *  other members of its StatVar's smallest group with data here
 *  (`related_measures`, from `related_group`), under a title naming the
 *  group. The title is null when there are none. */
export function relatedMeasures(spec: Pick<Spec, 'related_group' | 'related_measures'>): {
    title: string | null;
    measures: RelatedMeasure[];
} {
    const measures = spec.related_measures ?? [];
    const group = spec.related_group?.label ?? spec.related_group?.ref ?? null;

    return {
        title:
            measures.length > 0
                ? group
                    ? `Other indicators in ${group}`
                    : 'Other indicators'
                : null,
        measures,
    };
}
