/* eslint-disable @typescript-eslint/no-explicit-any -- reads the flat page Spec, typed shallowly like the rest of the engine-contract layer */
/**
 * The props of the search usage events (docs/analytics.md): `search.query`,
 * `search.empty`, `search.edit` and `search.studio_handoff` all describe one
 * answer the same way. They give what the answer was (`kind`, and a declined
 * answer's `reason`), the operations the question asked for, what resolved
 * (each part's definition and counts) and what did not (each refused part's
 * reason).
 *
 * POST /api/events stores at most MAX_PROPS_BYTES of props, and one answer
 * can serve hundreds of StatVars and places, so a part's props grow with the
 * question alone and the free text is clipped. A role's places
 * are its named group, a sample of members and the count, and a slot's refs
 * are a sample and the count. The event then steps down a ladder until it
 * fits. The rungs are every source id, three source ids per part, a minimal
 * form per part, and last a floor of fixed size. The last two are marked
 * `truncated`.
 * The ladder runs on the complete props, `seeds` and a settled post's run
 * fields included, and every rung is measured as the route measures it
 * (`fitsProps`). The run fields stay on every rung, and the floor drops only
 * their `byStep`. The API takes at most six
 * parts per question (`_PARSED_MAX_PARTS` in dfo-apis
 * search/models/request.py), and the floor holds only a fixed-length spec id
 * and integer counts per part, so it needs no check.
 */

import { fitsProps } from '../events/limits.ts';
import type {
    DeclinedReason,
    HydratedPart,
    IdentityBinding,
    OperationVerb,
    Resolution,
    ResolveResponse,
    Spec,
    SpecIdentity,
} from './types.ts';

/** How many entity terms a refused part keeps. */
export const EVENT_SAMPLE = 3;
const MAX_QUERY = 500;
const MAX_TERM = 100;
const MAX_SPEC_ID = 64;

type Rung = 'full' | 'sampled' | 'minimal' | 'floor';

/** Where a search's text came from: the prompt, an example sentence, the
 *  starting point's catalogue, a refine of the heading, a retry, a `?q=`
 *  permalink, a share link, or a dataset version link (`?spec=`). */
export type SearchSource =
    'typed' | 'example' | 'catalogue' | 'refine' | 'retry' | 'permalink' | 'share' | 'version_link';

/** The useSearchRun callback that posted an edit. `replay` is a permalink's
 *  stored edits, posted once after its base run lands. */
export type EditKind =
    'slot' | 'entity' | 'window' | 'facet' | 'pick' | 'measure' | 'parsed' | 'shared' | 'replay';

/** The engine's own verdict on an answer: a resolution's `status`, else its
 *  `kind`. dfo-apis logs the same value on its `resolve` line. */
export type SearchOutcome = Resolution['status'] | 'catalogue' | 'declined';

export const searchOutcome = (response: ResolveResponse): SearchOutcome =>
    response.kind === 'resolution' ? response.status : response.kind;

/** What every event of one post carries. `post` is 0 for the base run and
 *  counts up for each edit post of the same `searchId`. `hidden` marks a post
 *  whose page was hidden while it was in flight. */
export type SearchRunProps = {
    searchId: string;
    post: number;
    source: SearchSource;
    edited: boolean;
    editKind?: EditKind;
    traceId: string | null;
    /** Client time from the post's start to this event. */
    ms: number;
    hidden?: true;
};

/** A settled post's own fields, kept on every rung of the fit. */
export type SearchSettleProps = SearchRunProps & {
    outcome: SearchOutcome;
    /** The engine's `done.elapsed_ms`, trailing observation reads included. */
    engineMs: number;
    /** The engine's `timing_ms.by_step`; dropped on the floor rung. */
    byStep?: Record<string, number>;
    /** The soft deadline cut the run short; its unfinished parts read as no_data. */
    timedOut: boolean;
};

export type SearchEventProps = Partial<SearchSettleProps> & {
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

// What a part asked for, from its hashed identity and its Spec's named groups: the measure, the filters
// it bound, the places per role, the window and the facets. This grows with
// the question, never with the data. An aid answer elects hundreds of
// StatVars and can span every recipient, so those expanded lists go in as
// counts and samples.
const askedFor = (
    identity: SpecIdentity | null | undefined,
    groups: Spec['entity_groups'],
): AskedFor | null => {
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
                const group = groups?.[role];

                return [
                    role,
                    {
                        group: group ? { dcid: group.ref, label: group.label } : null,
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
    run,
}: {
    query: string;
    edited: boolean;
    kind: ResolveResponse['kind'];
    reason: DeclinedReason | null;
    parts: HydratedPart[];
    /** A caller's own fields ride inside the fit, so none is added after it. */
    seeds?: number;
    /** A settled post's fields, or the ids a Studio hand-off carries. */
    run?: Partial<SearchSettleProps>;
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
                (source: { ref: string }) => source.ref,
            );

            const asked = askedFor(spec.identity, spec.entity_groups);
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

    const runProps = (rung: Rung): Partial<SearchSettleProps> => {
        if (!run) {
            return {};
        }

        const { byStep, ...kept } = run;

        return rung === 'floor' || !byStep ? kept : { ...kept, byStep };
    };
    const props = (rung: Rung): SearchEventProps => ({
        ...runProps(rung),
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

/** The events one post can end on, and the abandon a hidden page sends. */
export type SearchPostEventName =
    'search.query' | 'search.empty' | 'search.edit' | 'search.error' | 'search.abandon';

/** Why a post ended in flight: the page was hidden, a newer post or the
 *  starting point replaced it, the reader reset the page, or the reader
 *  navigated away and the search unmounted. */
export type AbandonReason = 'hidden' | 'superseded' | 'reset' | 'left';

/** The fields of the engine's `done` event a settle reads. */
export type SearchDone = { trace_id: string; elapsed_ms: number; timed_out: boolean };

/** A failure as the stream reports it: a problem-details `code`, the HTTP
 *  `status`, and the `trace_id` when the engine sent one. */
export type SearchFailure = {
    code?: string | null;
    status?: number | null;
    traceId?: string | null;
};

export type SearchPostTracker = ReturnType<typeof searchPostTracker>;

/**
 * The usage events of one post: a base run (`post` 0) or one edit post.
 * The post ends exactly once, on the first of `settle`, `fail` or `abandon`;
 * every later call is a no-op, so a stream's trailing events, a late abort
 * or a second hide cannot send a second terminal event. `hide` sends one
 * `search.abandon` with reason `hidden` while the post is in flight and marks
 * the post's later terminal event `hidden: true`.
 */
export function searchPostTracker(
    post: {
        searchId: string;
        post: number;
        source: SearchSource;
        editKind: EditKind | null;
        query: string;
        /** The page the post started on; a `left` abandon runs after the URL has changed. */
        page: string;
    },
    {
        emit,
        now,
    }: {
        emit: (name: SearchPostEventName, props: Record<string, unknown>, page: string) => void;
        now: () => number;
    },
) {
    const startedAt = now();
    const edited = post.post > 0;
    let ended = false;
    let hidden = false;
    let traceId: string | null = null;
    let step: string | null = null;

    const runProps = (): SearchRunProps => ({
        searchId: post.searchId,
        post: post.post,
        source: post.source,
        edited,
        ...(post.editKind && { editKind: post.editKind }),
        traceId,
        ms: Math.round(now() - startedAt),
        ...(hidden && { hidden: true as const }),
    });
    const end = (): boolean => {
        if (ended) {
            return false;
        }

        ended = true;

        return true;
    };

    const fail = ({ code, status, traceId: failedTrace }: SearchFailure) => {
        if (!end()) {
            return;
        }

        traceId = failedTrace ?? traceId;
        emit(
            'search.error',
            {
                ...runProps(),
                query: clip(post.query, MAX_QUERY),
                error: code ?? (status != null ? String(status) : 'stream'),
                ...(status != null && { status }),
            },
            post.page,
        );
    };

    return {
        /** The last pipeline step the post reached, for an abandon. */
        step(name: string) {
            step = name;
        },
        /** The answer landed: its trace id joins any later error or abandon. */
        respond(response: ResolveResponse) {
            traceId = response.diagnostics.trace_id;
        },
        /** `response` and `parts` are the post's own answer with `done`
         *  applied. A post whose stream ended with no answer is an error. */
        settle({
            response,
            parts,
            done,
        }: {
            response: ResolveResponse | null;
            parts: HydratedPart[];
            done: SearchDone;
        }) {
            if (!response) {
                fail({ code: 'no_response', traceId: done.trace_id });

                return;
            }

            if (!end()) {
                return;
            }

            traceId = done.trace_id;

            const byStep = response.diagnostics.timing_ms?.by_step;
            const props = searchEventProps({
                query: post.query,
                edited,
                kind: response.kind,
                reason: response.kind === 'declined' ? response.reason : null,
                parts,
                run: {
                    ...runProps(),
                    outcome: searchOutcome(response),
                    engineMs: done.elapsed_ms,
                    ...(byStep && { byStep }),
                    timedOut: done.timed_out,
                },
            });

            emit(edited ? 'search.edit' : searchEventName(props), props, post.page);
        },
        fail,
        abandon(reason: Exclude<AbandonReason, 'hidden'>) {
            if (!end()) {
                return;
            }

            emit('search.abandon', { ...runProps(), reason, step }, post.page);
        },
        hide() {
            if (ended || hidden) {
                return;
            }

            emit('search.abandon', { ...runProps(), reason: 'hidden', step }, post.page);
            hidden = true;
        },
    };
}

/** The search and the trace behind the answer on screen, null for each
 *  before a search and on the starting point. */
export type SearchIds = { searchId: string | null; traceId: string | null };

/**
 * Starts a visitor's action on the answer on screen: reads the ids now and
 * returns the sender of its `search.action`. A share or a download sends
 * once its request lands, when a newer search may be on screen, and the
 * event still names the search the visitor acted on, and the page it was on.
 */
export function startSearchAction<TAction extends object>(
    searchIds: () => SearchIds,
    emit: (name: 'search.action', props: Record<string, unknown>, page: string) => void,
    page: string,
): (action: TAction) => void {
    const ids = searchIds();

    return (action) => emit('search.action', { ...ids, ...action }, page);
}
