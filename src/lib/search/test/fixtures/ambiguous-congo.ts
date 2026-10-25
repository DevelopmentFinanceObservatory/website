/**
 * Trimmed from two real captured `/api/search/resolve` responses, both
 * entity_ambiguous on "Congo" (DRC vs. Republic of Congo). Neither capture's
 * own deployment sends `no_data.ambiguous_entities` yet, so that field is
 * added by hand here, typed by the generated `NoData`: `{text, candidates:
 * [{ref, label, kind}]}`. The two real Congo dcids (country/COD,
 * country/COG) and the candidate labels are the ones the captures' own
 * `rendered_sentence` already names ("Congo [DRC]"/"Congo [Republic]").
 * The "ODA to the Congo" refusal also carries `no_data.options`, one ready
 * request per candidate, built the way dfo-apis search/engine/conjoin.py
 * `_entity_options` builds them from the restatement. "GDP of Congo" has no
 * restatement, so it carries none.
 */

import type { NoData, NoDataOption, ParsedPart, SentenceToken } from '../../types.ts';

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

/** "aid from Congo to Congo": one wording asked for each end, so the refusal
 *  carries two `ambiguous_entities` groups written alike. Each option pins
 *  one end by its candidate's name and posts the other as "Congo", and names
 *  its group as `entity_choice`, as dfo-apis search/engine/conjoin.py
 *  `_entity_options` builds them. */
const congoEnds: NoDataOption[] = [0, 1].flatMap((entityChoice) =>
    [
        ['country/COD', 'Congo [DRC]'],
        ['country/COG', 'Congo [Republic]'],
    ].map(([dcid, label]) => {
        const pinned = { text: label, dcid };
        const [origin, destination] =
            entityChoice === 0 ? [pinned, { text: 'Congo' }] : [{ text: 'Congo' }, pinned];

        return {
            mentions: ['Congo'],
            entity_choice: entityChoice,
            label,
            data_query: {
                kind: 'parsed' as const,
                parts: [
                    {
                        variable_text: 'aid',
                        entities: [
                            { ...origin, role_text: 'from' },
                            { ...destination, role_text: 'to' },
                        ],
                    },
                ],
            },
        };
    }),
);

const congoGroup = {
    text: 'Congo',
    candidates: [
        { ref: 'country/COD', label: 'Congo [DRC]', kind: 'country' },
        { ref: 'country/COG', label: 'Congo [Republic]', kind: 'country' },
    ],
};

export const congoToCongoNoData: NoData = {
    reason: 'entity_ambiguous',
    entity_terms: ['Congo', 'Congo'],
    ambiguous_entities: [congoGroup, congoGroup],
    options: congoEnds,
    unbound_qualifiers: [],
};

export const congoToCongoRestatement: ParsedPart = {
    variable_text: 'aid',
    entities: [
        { text: 'Congo', role_text: 'from' },
        { text: 'Congo', role_text: 'to' },
    ],
};

/** The two wording slot tokens of its sentence plan, as dfo-apis
 *  search/render/no_data.py `_ambiguous_entity_plan` marks them. */
export const congoToCongoWordings: SentenceToken[] = [
    { kind: 'slot', text: 'Congo', role: 'origin', entity_choice: 0 },
    { kind: 'slot', text: 'Congo', axis: 'where', role: 'destination', entity_choice: 1 },
];
