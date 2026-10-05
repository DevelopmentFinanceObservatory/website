/**
 * Trimmed from two real captured `/api/search/resolve` responses, both
 * entity_ambiguous on "Congo" (DRC vs. Republic of Congo). Neither capture's
 * own deployment sends `no_data.ambiguous_entities` yet, so that field is
 * added by hand here, in the shape the API ships (models/outcomes.py's
 * AmbiguousEntityGroup/AmbiguousEntityCandidate): `{text, candidates:
 * [{dcid, label, kind}]}`. The two real Congo dcids (country/COD,
 * country/COG) and the candidate labels are the ones the captures' own
 * `rendered_sentence` already names ("Congo [DRC]"/"Congo [Republic]").
 */

import type { NoData, ParsedPart } from '../../types.ts';

/** "GDP of Congo": a subject-role entity_ambiguous part. `restatement` is
 *  null on this real capture (the leg's direction came from wording alone,
 *  with no door-supplied role to confirm it), so this fixture exercises the
 *  "no restatement" fallback. */
export const gdpOfCongoNoData: NoData = {
    reason: 'entity_ambiguous',
    entity_terms: ['Congo'],
    ambiguous_entities: [
        {
            text: 'Congo',
            candidates: [
                { dcid: 'country/COD', label: 'Congo [DRC]', kind: 'country' },
                { dcid: 'country/COG', label: 'Congo [Republic]', kind: 'country' },
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
                { dcid: 'country/COD', label: 'Congo [DRC]', kind: 'country' },
                { dcid: 'country/COG', label: 'Congo [Republic]', kind: 'country' },
            ],
        },
    ],
    unbound_qualifiers: [],
};

export const odaToCongoRestatement: ParsedPart = {
    variable_text: 'official development assistance',
    entities: [{ text: 'Congo', role_text: 'to' }],
};
