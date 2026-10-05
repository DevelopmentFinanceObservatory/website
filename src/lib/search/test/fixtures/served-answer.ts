/* eslint-disable @typescript-eslint/no-explicit-any -- reads the raw wire fixtures */
/**
 * A served-options fixture (served-options.ts) as the page holds it: the
 * envelope's plan, the definite parts with their flattened specs, and the
 * slot options keyed the way useSearchRun folds its trailing events (the
 * response's own lists first, then each later `slot_options` event).
 */

import { keyRef, normalizeResponse } from '../../searchClient.ts';
import type { RefinePart } from '../../refineMenu.ts';
import type { SentenceToken } from '../../types.ts';
import { mergeSlotOptionsEntry, type SlotOptionsEntry } from '../../view.ts';

export type ServedAnswer = {
    plan: SentenceToken[];
    partCount: number;
    parts: RefinePart[];
    optionsBySpec: Record<string, Record<string, SlotOptionsEntry>>;
};

export function servedAnswer(body: unknown, events: unknown = []): ServedAnswer {
    const response = normalizeResponse(body);
    const parts: RefinePart[] = response.parts.flatMap((part: any, index: number) =>
        part.status === 'definite'
            ? [{ index, variableText: part.variable_text ?? null, spec: part.spec }]
            : [],
    );
    const entries = [
        ...parts.flatMap(({ spec }) =>
            (spec.slot_options ?? []).map((entry: any) => ({ spec_id: spec.spec_id, ...entry })),
        ),
        ...(events as any[]),
    ];
    const optionsBySpec = entries.reduce(
        (bySpec, entry) =>
            mergeSlotOptionsEntry(bySpec, entry.spec_id, keyRef(entry.key), {
                options: entry.options,
                truncated: entry.truncated,
            }),
        {} as Record<string, Record<string, SlotOptionsEntry>>,
    );

    return { plan: response.sentence_plan, partCount: response.parts.length, parts, optionsBySpec };
}
