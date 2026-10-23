/**
 * Trimmed from two real captured `/api/search/resolve` responses, both
 * entity_ambiguous on "Congo" (DRC vs. Republic of Congo). Neither capture's
 * own deployment sends `no_data.ambiguous_entities` yet, so that field is
 * added by hand here, in the shape the API ships (models/outcomes.py's
 * AmbiguousEntityGroup/AmbiguousEntityCandidate): `{text, candidates:
 * [{dcid, label, kind}]}`. The two real Congo dcids (country/COD,
 * country/COG) and the candidate labels are the ones the captures' own
 * `rendered_sentence` already names ("Congo [DRC]"/"Congo [Republic]").
 * The "ODA to the Congo" refusal also carries `no_data.options`, one ready
 * request per candidate, built the way dfo-apis search/engine/conjoin.py
 * `_entity_options` builds them from the restatement. "GDP of Congo" has no
 * restatement, so it carries none.
 */

import type { NoData, NoDataOption, ParsedPart } from '../../types.ts';

const congoOption = (dcid: string, label: string): NoDataOption => ({
    mentions: ['Congo'],
    label,
    data_query: {
        kind: 'parsed',
        parts: [
            {
                variable_text: 'official development assistance',
                entities: [{ text: 'Congo', role_text: 'to', dcid }],
            },
        ],
    },
});

/** "GDP of Congo": a subject-role entity_ambiguous part. `restatement` is
 *  null on this real capture (the leg's direction came from wording alone,
 *  with no door-supplied role to confirm it), so the refusal carries no
 *  options and offers no picker. */
export const gdpOfCongoNoData: NoData = {
    reason: 'entity_ambiguous',
    entity_terms: ['Congo'],
    ambiguous_entities: [
        {
            text: 'Congo',
            candidates: [
                { ref: 'country/COD', label: 'Congo [DRC]', kind: 'country' },
                { ref: 'country/COG', label: 'Congo [Republic]', kind: 'country' },
            ],
        },
    ],
    unbound_qualifiers: [],
};

export const gdpOfCongoRestatement: ParsedPart | null = null;

/** "official development assistance to the Congo": a directional entity_ambiguous
 *  part. `restatement` is non-null on the real capture — the flow-shaped
 *  entity's own role ("to") was nameable. */
export const odaToCongoNoData: NoData = {
    reason: 'entity_ambiguous',
    entity_terms: ['Congo'],
    ambiguous_entities: [
        {
            text: 'Congo',
            candidates: [
                { ref: 'country/COD', label: 'Congo [DRC]', kind: 'country' },
                { ref: 'country/COG', label: 'Congo [Republic]', kind: 'country' },
            ],
        },
    ],
    options: [
        congoOption('country/COD', 'Congo [DRC]'),
        congoOption('country/COG', 'Congo [Republic]'),
    ],
    unbound_qualifiers: [],
};

export const odaToCongoRestatement: ParsedPart = {
    variable_text: 'official development assistance',
    entities: [{ text: 'Congo', role_text: 'to' }],
};
