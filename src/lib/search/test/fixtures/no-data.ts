/** Minimal no_data wire builders shared by the search tests. */

/** A minimal wire Spec: just enough of the definition/resolved split for
 *  flattenSpec to lift `resolved` flat without flagging stat_vars_unreadable.
 *  `resolvedOverrides` merges onto `resolved` (e.g. `{ rendered_sentence }`),
 *  for a caller that needs a spec whose sentence is or isn't populated. */
export function wireSpec(specId: string, resolvedOverrides: Record<string, unknown> = {}): unknown {
    return {
        spec_id: specId,
        definition: { schema_version: 1, spec_id: specId, identity: { identity_version: 'spec1' } },
        resolved: {
            shape: {
                shape_id: 'dev_finance_crs_dac',
                label: 'development finance flows',
                slot_keys: [],
            },
            slots: [],
            stat_vars: { member_count: 1, member_count_exact: true, served_count: 1 },
            entities: [],
            coverage: { kind: 'bare', has_data: false },
            trace: {
                resolved_entities: [],
                resolved_sources: [],
                slot_filters: [],
            },
            ...resolvedOverrides,
        },
    };
}

/** One no_data part naming `reason`/`gate` and carrying `nearFields`
 *  (flagged_match and/or alternate_match), wrapped in a full envelope. */
export function noDataResponse(
    reason: string,
    gate: string | null,
    nearFields: Record<string, unknown>,
): unknown {
    return {
        schema_version: 1,
        kind: 'resolution',
        query_echo: { entry_path: 'raw_text', raw_query: 'q', extract_skipped: false },
        diagnostics: { engine_build: 'test', warnings: [], timing_ms: { total: 1 } },
        parts: [
            {
                variable_text: 'government expenditure',
                warnings: [],
                status: 'no_data',
                no_data: { reason, gate, entity_terms: [], unbound_qualifiers: [], ...nearFields },
            },
        ],
        status: 'no_data',
    };
}
