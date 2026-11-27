// No imports, so the usage events' definition (studioLayoutEvents.ts) reads
// it under plain node.

/** The codes a refusal of a card change can carry: a 422's `constraint_id`
 *  (`scope_choice_stale`, `change_not_offered`, `unit_not_offered`,
 *  `change_no_data`), a 503's `constraint_id` (`place_options_unavailable`)
 *  or its `error` (`capability_unavailable`). */
export const CHANGE_REFUSAL_CODES = [
    'scope_choice_stale',
    'change_not_offered',
    'unit_not_offered',
    'change_no_data',
    'place_options_unavailable',
    'capability_unavailable',
] as const;

export type ChangeRefusalCode = (typeof CHANGE_REFUSAL_CODES)[number];
