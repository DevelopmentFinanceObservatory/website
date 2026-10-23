/**
 * A served-options fixture (served-options.ts) as the page holds it: the
 * envelope's plan, the definite parts with their flattened specs, and the
 * slot options keyed the way useSearchRun folds its trailing events (the
 * response's own lists first, then each later `slot_options` event).
 */

import { keyRef } from '../../searchClient.ts';
import type { RefinePart } from '../../refineMenu.ts';
import { knownPart, type SentenceToken, type SlotOptions } from '../../types.ts';
import { mergeSlotOptionsEntry, type SlotOptionsEntry } from '../../view.ts';
import { resolution } from './resolution.ts';

export type ServedAnswer = {
    plan: SentenceToken[];
    partCount: number;
    parts: RefinePart[];
    optionsBySpec: Record<string, Record<string, SlotOptionsEntry>>;
};

export function servedAnswer(body: unknown, events: unknown = []): ServedAnswer {
    const response = resolution(body);
    const parts: RefinePart[] = response.parts.flatMap((part, index) => {
        const known = knownPart(part);

        return known?.status === 'definite'
            ? [{ index, variableText: known.variable_text ?? null, spec: known.spec }]
            : [];
    });
    // The trailing `slot_options` events carry the response's entry shape with the spec_id.
    const entries: (SlotOptions & { spec_id: string })[] = [
        ...parts.flatMap(({ spec }) =>
            (spec.slot_options ?? []).map((entry) => ({ spec_id: spec.spec_id, ...entry })),
        ),
        ...(events as (SlotOptions & { spec_id: string })[]),
    ];
    const optionsBySpec = entries.reduce(
        (bySpec, entry) =>
            mergeSlotOptionsEntry(bySpec, entry.spec_id, keyRef(entry.key), {
                options: entry.options,
                truncated: entry.truncated,
            }),
        {} as Record<string, Record<string, SlotOptionsEntry>>,
    );

    return {
        plan: response.sentence_plan ?? [],
        partCount: response.parts.length,
        parts,
        optionsBySpec,
    };
}
