/**
 * What Refine offers: the bindings of the answer's definite parts that no
 * visible token states (SentenceToken.states), each with something to pick:
 * slots, open roles, and the measurement method, a facet axis no slot
 * carries. A binding a token states is edited from that token alone. Pure;
 * no React.
 */

import { statingTokenIndex } from './departures.ts';
import { keyRef } from './searchClient.ts';
import type { PartSpec, RoleAxis, SentenceToken, Slot } from './types';
import {
    methodPicker,
    openEntityEntry,
    optionLabel,
    slotOffersChoice,
    slotOptionsEntry,
    sourceSlotOptions,
    type EntityOptionsBySpec,
    type EntityOptionsEntry,
    type MethodPicker,
    type SlotOptionsEntry,
} from './view.ts';

/** A definite part as Refine reads it. */
export type RefinePart = { index: number; variableText: string | null; spec: PartSpec };

/** One Refine entry. `key` names it (`refineKey`), so a departure's action
 *  can open Refine at it. A bound slot or facet axis carries its `current`
 *  value; an unbound one carries null. */
export type RefineItem =
    | {
          kind: 'slot';
          key: string;
          part: RefinePart;
          slot: Slot;
          slotIndex: number;
          entry: SlotOptionsEntry;
          current: string | null;
      }
    | { kind: 'entity'; key: string; part: RefinePart; role: RoleAxis; entry: EntityOptionsEntry }
    | {
          kind: 'facet';
          key: string;
          part: RefinePart;
          axis: 'measurementMethod';
          picker: MethodPicker;
          current: string | null;
      };

/** The binding ref the byline's method token states while the identity
 *  binds the measurement method. */
export const METHOD_REF = 'method:';

/** The key of part `partIndex`'s Refine entry for binding `ref`
 *  (`how:crsTypeOfFlow`, `origin:`). */
export const refineKey = (partIndex: number, ref: string): string => `${partIndex}:${ref}`;

const EMPTY: SlotOptionsEntry = { options: [], truncated: false };

// A bound slot's value as the reader names it: one label, or a set's
// labels joined.
const boundText = (binding: Slot['binding']): string | null => {
    if (binding?.kind === 'value') return optionLabel({ value: binding.value });
    if (binding?.kind === 'set') {
        return (binding.values ?? []).map((value) => optionLabel({ value })).join(', ');
    }

    return null;
};

/**
 * Refine's entries over `parts`, in part order: each part's slots in slot
 * order, then its open roles. A slot is listed when no visible token of
 * `plan` (the envelope's composed plan) states its ref and its menu offers
 * something other than its current value; an open role when no token
 * states it and it has options; the measurement method, last, when no token
 * states "method:" and `methodPicker` offers a choice. The source slot reads
 * facet options.
 */
export function refineItems({
    parts,
    plan,
    partCount,
    optionsBySpec,
    entityOptionsBySpec,
}: {
    parts: readonly RefinePart[];
    plan: readonly SentenceToken[] | null | undefined;
    /** the response's part count, which routes the plan's tokens
     *  (tokenPart) */
    partCount: number;
    optionsBySpec: Record<string, Record<string, SlotOptionsEntry>>;
    entityOptionsBySpec: EntityOptionsBySpec;
}): RefineItem[] {
    return parts.flatMap((part) => {
        const { spec } = part;
        const stated = (ref: string) => statingTokenIndex(plan, partCount, part.index, ref) !== -1;

        const slots = (spec.slots ?? []).flatMap((slot, slotIndex): RefineItem[] => {
            const ref = keyRef(slot.key);
            const entry: SlotOptionsEntry =
                slot.key?.axis === 'source'
                    ? { options: sourceSlotOptions(spec), truncated: false }
                    : slot.key?.property
                      ? slotOptionsEntry(optionsBySpec, spec.spec_id, ref)
                      : EMPTY;

            if (stated(ref) || !slotOffersChoice(slot, entry, spec)) return [];

            return [
                {
                    kind: 'slot',
                    key: refineKey(part.index, ref),
                    part,
                    slot,
                    slotIndex,
                    entry,
                    current: boundText(slot.binding),
                },
            ];
        });

        const roles = (['origin', 'destination'] as const).flatMap((role): RefineItem[] => {
            const ref = `${role}:`;
            const entry = openEntityEntry(spec, entityOptionsBySpec, role);

            return entry && !stated(ref) && (entry.options.length > 0 || entry.truncated)
                ? [{ kind: 'entity', key: refineKey(part.index, ref), part, role, entry }]
                : [];
        });

        const picker = stated(METHOD_REF) ? null : methodPicker(spec);
        const method: RefineItem[] = picker
            ? [
                  {
                      kind: 'facet',
                      key: refineKey(part.index, METHOD_REF),
                      part,
                      axis: 'measurementMethod',
                      picker,
                      // "Any method" is checked exactly while the axis is
                      // unbound.
                      current: picker.choices[0]?.checked ? null : picker.label,
                  },
              ]
            : [];

        return [...slots, ...roles, ...method];
    });
}

/** The dimension a Refine entry narrows, as the reader names it
 *  ("sector", "provider"). */
export const refineItemName = (item: RefineItem): string => {
    if (item.kind === 'entity') return item.role === 'origin' ? 'provider' : 'recipient';
    if (item.kind === 'facet') return 'measurement method';

    return item.slot.key?.label ?? 'value';
};
