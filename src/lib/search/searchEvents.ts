/* eslint-disable @typescript-eslint/no-explicit-any -- reads the flat page Spec, typed shallowly like the rest of the engine-contract layer */
/**
 * The props of the search usage events (docs/analytics.md): `search.query`,
 * `search.empty` and `search.studio_handoff` all describe one answer the
 * same way. What the answer was (`kind`, and a declined answer's `reason`),
 * the operations the question asked for, what resolved (each part's
 * definition and counts) and what did not (each refused part's reason).
 *
 * POST /api/events stores at most MAX_PROPS_BYTES of props, and one answer
 * can serve hundreds of StatVars and places, so a part's props follow the
 * question, never the data, and the free text is clipped. A role's places
 * are its named group, a sample of members and the count, and a slot's refs
 * are a sample and the count. The event then steps down a ladder until it
 * fits: every source id, three source ids per part, a minimal form per part,
 * and last a floor of fixed size, each marked `truncated` but the first two.
 * The ladder runs on the complete props, `seeds` included, and every rung is
 * measured as the route measures it (`fitsProps`). The API takes at most six
 * parts per question (`_PARSED_MAX_PARTS` in dfo-apis
 * search/models/request.py); the floor holds only a fixed-length spec id and
 * integer counts per part, so it needs no check.
 */

import { fitsProps } from '../events/limits.ts';
import type {
    DeclinedReason,
    HydratedPart,
    IdentityBinding,
    OperationVerb,
    ResolveResponse,
    SpecIdentity,
} from './types.ts';

/** How many entity terms a refused part keeps. */
export const EVENT_SAMPLE = 3;
const MAX_QUERY = 500;
const MAX_TERM = 100;
const MAX_SPEC_ID = 64;

type Rung = 'full' | 'sampled' | 'minimal' | 'floor';

export type SearchEventProps = {
    query: string;
    edited: boolean;
    kind: ResolveResponse['kind'];
    reason: DeclinedReason | null;
    operations: OperationVerb[];
    /** Studio seeds stored by a handoff click. */
    seeds?: number;
    /** Set when the event had to drop to its minimal form or the floor. */
    truncated?: true;
    resolved: ({
        specId: string;
        statVarCount: number;
        entityCount: number;
        sources?: string[];
        sourceCount: number;
    } & Partial<AskedFor>)[];
    refused: {
        variableText: string | null;
        status: string;
        reason: string | null;
        entityTerms: string[];
    }[];
};

type AskedFor = {
    measure: SpecIdentity['shape'];
    filters: Record<string, string | string[] | Sampled>;
    entities: Record<string, Partial<PlaceRole> & { count: number }>;
    window: SpecIdentity['requested_window'];
    facets: NonNullable<SpecIdentity['facets']> | Record<string, never>;
};

/** A set-valued slot with more refs than EVENT_SAMPLE. */
type Sampled = { sample: string[]; count: number };

type PlaceRole = {
    group: { dcid: string | null; label: string } | null;
    sample: string[];
    count: number;
};

const sample = <T>(list: T[]): T[] => list.slice(0, EVENT_SAMPLE);

// Never ends on a high surrogate: a lone one is not valid JSON text and
// Postgres jsonb may refuse the insert.
const clip = (text: string, max: number): string => {
    const clipped = text.slice(0, max);

    return /[\uD800-\uDBFF]$/.test(clipped) && text.length > max ? clipped.slice(0, -1) : clipped;
};

const boundRef = (binding: IdentityBinding): string | string[] | null =>
    binding.state === 'set' ? binding.refs : binding.state === 'unbound' ? null : binding.ref;

// What a part asked for, from its hashed identity: the measure, the filters
// it bound, the places per role, the window and the facets. This grows with
// the question, never with the data. An aid answer elects hundreds of
// StatVars and can span every recipient, so those expanded lists go in as
// counts and samples.
const askedFor = (identity: SpecIdentity | null | undefined): AskedFor | null => {
    if (!identity) {
        return null;
    }

    const filters: AskedFor['filters'] = {};

    for (const slot of identity.slots) {
        const ref = boundRef(slot.binding);

        if (ref !== null) {
            filters[slot.property] =
                Array.isArray(ref) && ref.length > EVENT_SAMPLE
                    ? { sample: sample(ref), count: ref.length }
                    : ref;
        }
    }

    return {
        measure: identity.shape,
        filters,
        entities: Object.fromEntries(
            Object.entries(identity.entities).map(([role, members]) => {
                const group = identity.entity_groups?.[role];

                return [
                    role,
                    {
                        group: group ? { dcid: group.dcid, label: group.label } : null,
                        sample: sample(members),
                        count: members.length,
                    },
                ];
            }),
        ),
        window: identity.requested_window,
        facets: identity.facets ?? {},
    };
};

export function searchEventProps({
    query,
    edited,
    kind,
    reason,
    parts,
    seeds,
}: {
    query: string;
    edited: boolean;
    kind: ResolveResponse['kind'];
    reason: DeclinedReason | null;
    parts: HydratedPart[];
    /** A caller's own fields ride inside the fit, so none is added after it. */
    seeds?: number;
}): SearchEventProps {
    const operations = [
        ...new Set(parts.flatMap((part) => (part.part?.operations ?? []).map((op) => op.verb))),
    ];
    const definite = parts
        .filter((part) => part.part?.status === 'definite' && part.hydratedSpec)
        .map((part) => part.hydratedSpec as any);
    const resolve = (rung: Rung) =>
        definite.map((spec) => {
            const sources: string[] = (spec.resolution?.resolved_sources ?? []).map(
                (source: { dcid: string }) => source.dcid,
            );

            const asked = askedFor(spec.identity);
            const counts = {
                specId: spec.spec_id,
                // The served members once settled, else the family's count.
                statVarCount: spec.stat_vars?.served_count ?? spec.stat_vars?.member_count ?? 0,
                entityCount: spec.resolution?.resolved_entities?.length ?? 0,
                sourceCount: sources.length,
            };

            if (rung === 'floor') {
                return { ...counts, specId: clip(counts.specId, MAX_SPEC_ID) };
            }

            return rung === 'minimal'
                ? {
                      ...counts,
                      ...(asked && {
                          measure: asked.measure,
                          entities: Object.fromEntries(
                              Object.entries(asked.entities).map(([role, { count }]) => [
                                  role,
                                  { count },
                              ]),
                          ),
                      }),
                  }
                : {
                      ...counts,
                      ...asked,
                      sources: sources.slice(0, rung === 'full' ? undefined : EVENT_SAMPLE),
                  };
        });
    const refused = parts
        .filter((part) => part.part && part.part.status !== 'definite')
        .map((part) => ({
            variableText: part.variableText && clip(part.variableText, MAX_TERM),
            status: part.part!.status,
            reason: part.part!.no_data?.reason ?? part.part!.unsupported?.code ?? null,
            entityTerms: sample(part.part!.no_data?.entity_terms ?? []).map((term) =>
                clip(term, MAX_TERM),
            ),
        }));

    const props = (rung: Rung): SearchEventProps => ({
        query: rung === 'floor' ? '' : clip(query, MAX_QUERY),
        edited,
        kind,
        reason,
        operations,
        ...(seeds !== undefined && { seeds }),
        ...(rung === 'minimal' || rung === 'floor' ? { truncated: true as const } : {}),
        resolved: resolve(rung),
        refused: rung === 'floor' ? [] : refused,
    });

    for (const rung of ['full', 'sampled', 'minimal'] as const) {
        const candidate = props(rung);

        if (fitsProps(candidate)) {
            return candidate;
        }
    }

    return props('floor');
}

/** A settled search is `search.query` when it answered: a part resolved, or
 *  the catalogue answered. Anything else, a declined question included, is
 *  `search.empty`, the data-gap signal. */
export const searchEventName = (props: SearchEventProps): 'search.query' | 'search.empty' =>
    props.resolved.length > 0 || props.kind === 'catalogue' ? 'search.query' : 'search.empty';
