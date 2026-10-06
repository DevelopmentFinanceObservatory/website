/* eslint-disable @typescript-eslint/no-explicit-any -- deliberately shallow engine-contract layer (see lib/search/types.ts for the full mirror) */
'use client';

/**
 * One live resolve run and everything it accretes, per part: the SSE
 * lifecycle (loading → done/error, pipeline steps, sentence preview), the
 * response with its trailing events merged in (observations, slot options,
 * entity options, keyed per spec), and the dataset-door edit surface built
 * on top of it. Routing/idle-typing concerns stay with the component.
 *
 * Exported interface, for the components rendering against this hook:
 *
 * - `phase: 'idle' | 'loading' | 'done' | 'error'`: run-level lifecycle.
 *   Flips to 'done'/'error' only on the initial raw_text run's own
 *   `done`/`error` event; an edit post never moves this (see `parts[i].phase`).
 * - `query`, `error`: the run's own text/HTTP-or-stream-level error (the
 *   raw_text run only; an edit post's transport failure lands on the
 *   touched part(s)' `phase`/`editError` instead).
 * - `sharedSteps: string[]`: the shared, once-per-request `extract` step's
 *   names (StepEvent.variable_index === null) from a raw_text run; a
 *   `dataset_resubmit` post carries no `interpretation`/`step`/`shape`/
 *   `sentence` events of its own, so it never touches this.
 * - partSteps: per-part step names, index-aligned with parts, feeding
 *   progressSuffix's "N of M parts resolved". A dataset_resubmit post
 *   never touches this.
 * - partSentencePlans: per-part sentence plans, index-aligned with parts,
 *   from each part's latest `sentence` SSE event. DataSearch.tsx's early
 *   heading joins the ones present (see lib/search/sentencePlan.ts's
 *   earlySentenceTokens). A dataset_resubmit post never touches this either.
 * - `response: Resolution | null`: the raw normalised envelope
 *   (status/diagnostics/parts), kept for whole-envelope reads (warnings,
 *   `status`, the composed `rendered_sentence`/`sentence_plan`). Prefer
 *   `parts` for anything per-variable. Null for a catalogue or declined
 *   answer, which lands in `answer` instead.
 * - `answer: PartlessAnswer | null`: a run whose response carries no parts.
 *   The run ends on its `done` like any other, with `response` null and
 *   `parts` empty. A declined or catalogue run streams no `interpretation`,
 *   so no skeleton is seeded either. `showStartingPoint` sets one with no
 *   run at all.
 * - `parts: HydratedPart[]`: one entry per part, in query order; index ===
 *   wire part position, always. Pre-sized and named from `interpretation`
 *   before any part has content, rendered as one unnamed skeleton while that
 *   event hasn't fired yet. Each entry carries its own `phase`, `editError`,
 *   and `hydratedSpec` (a definite part's spec with trailing
 *   observations/facet_options merged in), and `observationsPending` (a hydrated spec
 *   whose observations haven't arrived yet because a stream is open). Every edit
 *   (every action listed below) re-resolves the whole envelope through the
 *   `dataset_resubmit` door, so a `response` here always replaces every
 *   part at once. There is no per-part splice. An edit that resolves a
 *   part to no_data/candidates is shown in place like any other outcome;
 *   `editError` is reserved for a transport failure or a refusal naming this
 *   part, not for that outcome.
 * - `expectedParts: {index, variableText}[]`: the named skeleton list
 *   `parts` was seeded from; use it to size/name skeletons before `parts`
 *   carries real content.
 * - `optionsBySpec`, `entityOptionsBySpec`, `placeOptionsBySpec`: trailing
 *   per-spec option maps, spec_id-keyed; look up a candidate's own spec_id
 *   here too, since a candidate has no spec_id of its own to share with its
 *   part. `optionsBySpec`'s leaf is a `SlotOptionsEntry` (`{options,
 *   truncated}`, see lib/search/view.ts), the whole pair the wire's
 *   `slot_options` event carries — a menu reads it through
 *   `slotOptionsEntry` rather than indexing the map directly, so a missing
 *   spec/key reads as an empty, non-truncated entry instead of undefined.
 *   `placeOptionsBySpec` is scope-keyed under each spec_id (`peers`/
 *   `children`) rather than a list — a `place_options` event replaces its
 *   (spec_id, scope) entry outright, unlike `entityOptionsBySpec`'s append.
 *   PlaceEditor reads it through
 *   `placeOptionsForSpec`/`missingPlaceOptionScopes`. `place_options` only
 *   ever rides the BASE run's own stream (`runBaseStream`, below) — an edit
 *   post (`runDatasetStream`) touches only the part(s) it was posted for and
 *   never emits one, even for a spec that keeps the same spec_id across the
 *   edit. PlaceEditor's own wait for a scope to arrive must key off `phase`
 *   (this run-level field), not a part's own `phase`, or a click during an
 *   edit post waits out the whole grace for an event that isn't coming.
 * - edits: every part's latest successful identity/parsed entry, ready
 *   for permalink.ts's encodePermalinkState.
 * - `run(input, label)`: a fresh raw_text query; full replace, aborts any
 *   edit post in flight too.
 * - `showStartingPoint(label)`: settles on a catalogue answer with no place
 *   and no search call, for the page to fill from the catalogue it holds.
 * - `reset()`: abort everything, back to idle.
 * Indexed edit callbacks. Each posts a dataset_resubmit carrying every
 * part's current entry with just this index rewritten. editMeasure posts
 * the alternative's or related measure's own definition as the new spec,
 * not the part's current one. Every entry carries its part's operations
 * and the named groups of the Spec its identity derives from (see
 * datasetEntries.ts).
 * - `replay(state)`: runs `state.query`, then, right after its `response`
 *   event, builds one entries list from the fresh parts with every stored
 *   edit applied as an override at its own index (skipped with a note on
 *   that part when its `variableText` no longer matches), and posts it once,
 *   not a chain of per-part resubmits.
 * - `editShared(edit)`: a hoisted where/when/source/origin/unit/method
 *   qualifier's edit: one the composed sentence renders once for every
 *   definite part.
 *   Rewrites that axis in every definite part's own entry and posts all of
 *   them together in the same `dataset_resubmit`. A part that isn't
 *   definite (candidates/no_data/unsupported/still loading) is untouched.
 *   Silently no-ops (posts nothing) when no definite part has a slot for the
 *   edited axis.
 *
 * One in-flight edit-post controller at a time (`postController`): starting
 * a new edit aborts whatever edit post was still in flight. Concurrent edits
 * carry the first forward: every override not yet confirmed by a landed
 * response stays queued (`pendingOverridesRef`/`pendingIndicesRef`) and
 * rides along on top of `parts` in every post built while it's outstanding,
 * so a second edit landing before the first returns keeps both, even though
 * `parts` itself hasn't caught up to the first yet. Every part whose entry
 * changed across the accumulated overrides is marked 'loading' ("Updating…")
 * when a post starts. Every other part that a superseded post had left
 * 'loading' is cleared back to 'done', so an edit the new post doesn't
 * mention never gets stuck.
 *
 * The raw_text run's own `done` handler skips stamping every part 'done'
 * while an edit post is in flight (`postController.current`): that post owns
 * the final phase for the parts it's touching, and permalink replay is
 * exactly the case where the base run's `done` can arrive after the post has
 * already started. It also never downgrades a part already in 'error' phase
 * back to 'done', so a trailing `done` that arrives after an edit post has
 * settled (`postController.current` already cleared) can't overwrite an
 * error an edit just set.
 *
 * A refusal from the door carries a top-level `pointer` naming the entry it
 * refused (`/input/entries/{i}/...`). `editError` keys to that index when
 * present, or to every part the failed post was touching when it isn't.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { withEntityEdit, withFacetEdit, withResolvedSlotEdit } from '@/lib/search/promote';
import type { PermalinkEdit, PermalinkState } from '@/lib/search/permalink';
import {
    buildDatasetEntries,
    sharedRefEntry,
    specEntityGroups,
    type DatasetEntriesOverride,
} from '@/lib/search/datasetEntries';
import {
    bindSnapshotParts,
    frozenRefSpecId,
    unreadableSpecIds,
    type SnapshotBinding,
} from '@/lib/search/frozenObservations';
import { measureSwitchEntry, type MeasurePick } from '@/lib/search/measureMenu';
import { buildReplayPlan, nextEditsByPart } from '@/lib/search/permalinkEdits';
import {
    bindsMethod,
    entityOptionsEntry,
    mergeEntityOptionsEntry,
    mergePlaceOptionsEntry,
    mergeSlotOptionsEntry,
    sharedMethodServes,
    type EntityOptionsBySpec,
    type PlaceOptionsBySpec,
    type SlotOptionsEntry,
} from '@/lib/search/view';
import {
    applyDoneEvent,
    buildRequest,
    fetchSnapshotObservations,
    keyRef,
    type OpenedSearchShare,
    resolveStream,
    restorePlaceholderParts,
    SearchEvent,
    SearchInput,
} from '@/lib/search/searchClient';
import type {
    BaseIdentity,
    CatalogueAnswer,
    DatasetIdentityEntry,
    DatasetResubmitEntry,
    DeclinedAnswer,
    EntityRoleKey,
    ExpectedPart,
    HydratedPart,
    IdentityFacetAxis,
    IdentityFacets,
    IdentityUnitRequest,
    ParsedPart,
    PartPhase,
    Resolution,
    ResolveResponse,
    RoleAxis,
    SentenceToken,
    Spec,
    SpecObservations,
} from '@/lib/search/types';
import { sharedUnitEdit } from '@/lib/search/unitPicker';
import type { WindowApplyValue } from '@/lib/search/windowState';

export type SearchPhase = 'idle' | 'loading' | 'done' | 'error';

/** What the page renders of a catalogue or declined answer. The starting
 *  point the page shows from its own catalogue carries only these. */
export type PartlessAnswer =
    Pick<CatalogueAnswer, 'kind' | 'scope'> | Pick<DeclinedAnswer, 'kind' | 'reason' | 'scope'>;

/** A hoisted where/when/source/origin/unit/method qualifier's edit, fanned
 *  out to every definite part by `editShared`: one axis, applied everywhere
 *  it hoisted. A unit request applies to every part that converts
 *  (`sharedUnitEdit`); a method binding to every part that binds a method,
 *  the parts a stated method token speaks for. */
export type SharedEdit =
    | { axis: 'where'; binding: any; entityRole: EntityRoleKey }
    | { axis: 'source'; binding: any }
    | { axis: 'when'; window: WindowApplyValue }
    | { axis: 'entity'; role: RoleAxis; dcid: string }
    | { axis: 'unit'; request: IdentityUnitRequest }
    | { axis: 'method'; binding: IdentityFacets['measurementMethod'] | null };

type PartRuntime = Pick<HydratedPart, 'phase' | 'editError'>;

const EMPTY_RUNTIME: PartRuntime = {
    phase: 'loading',
    editError: null,
};

const addStep = (steps: string[], step: string): string[] =>
    steps.includes(step) ? steps : [...steps, step];

/** A definite part's spec, with the trailing SSE-only observations/facet
 *  entries folded in: the same merge every definite part needs, factored
 *  out so N parts hydrate identically. */
function hydrateDefiniteSpec(
    spec: Spec,
    obsBySpec: Record<string, any>,
    facetsBySpec: Record<string, Record<string, any>>,
    frozen?: SpecObservations,
): Spec {
    const live = spec.observations ?? obsBySpec[spec.spec_id] ?? null;

    return {
        ...spec,
        // A snapshot share's captured bytes win over whatever the live
        // replay streams for the same spec.
        observations: frozen ?? live,
        // Streamed facet entries override the response's (empty on SSE) by
        // axis; a buffered body's inline entries survive untouched.
        facet_options: (() => {
            const streamed = facetsBySpec[spec.spec_id] ?? {};
            const inline = (spec.facet_options ?? []).filter(
                (entry: any) => !(entry?.axis in streamed),
            );

            return [...inline, ...Object.values(streamed)];
        })(),
    } as Spec;
}

/** A lightweight `HydratedPart[]` view straight off a fresh `Resolution`,
 *  with no trailing-events hydration (`buildDatasetEntries` reads each
 *  Spec's `identity` and `entity_groups`, already flat on
 *  `normalizeResponse`'s output).
 *  `replay` uses this to build its entries list from the base run's just-
 *  landed response before React has re-rendered the hook's own `parts`. */
function partsFromResponse(response: Resolution): HydratedPart[] {
    return response.parts.map((part, index) => ({
        index,
        variableText: part.variable_text ?? null,
        part,
        hydratedSpec: part.status === 'definite' && part.spec ? part.spec : null,
        observationsPending: false,
        phase: 'done',
        editError: null,
    }));
}

/** Maps a refusal's `/input/entries/{i}/...` pointer to the entry index it
 *  names. Null when the pointer is absent, a different shape, or out of
 *  range for this post's own entries. The caller falls back to marking
 *  every part the post touched instead of one specific part. */
function pointerEntryIndex(pointer: string | null | undefined, entryCount: number): number | null {
    const match = pointer?.match(/^\/input\/entries\/(\d+)(?:\/|$)/);
    if (!match) return null;
    const index = Number(match[1]);
    return index >= 0 && index < entryCount ? index : null;
}

// Every input that starts a run, as it starts. The page mirrors the query
// into the URL; permalink edits are read off `edits` below instead of a
// per-call callback, since one `?s=` covers every part's edit, not just the
// one that just fired.
export const useSearchRun = () => {
    const [phase, setPhase] = useState<SearchPhase>('idle');
    const [query, setQuery] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [sharedSteps, setSharedSteps] = useState<string[]>([]);
    const [partSteps, setPartSteps] = useState<string[][]>([]);
    const [partSentencePlans, setPartSentencePlans] = useState<(SentenceToken[] | null)[]>([]);
    const [response, setResponse] = useState<Resolution | null>(null);
    const [answer, setAnswer] = useState<PartlessAnswer | null>(null);
    const [expectedParts, setExpectedParts] = useState<ExpectedPart[]>([]);
    const [runtimes, setRuntimes] = useState<PartRuntime[]>([]);
    const [editsByPart, setEditsByPart] = useState<Record<number, PermalinkEdit>>({});
    const [obsBySpec, setObsBySpec] = useState<Record<string, any>>({});
    const [optionsBySpec, setOptionsBySpec] = useState<
        Record<string, Record<string, SlotOptionsEntry>>
    >({});
    // facet_options ride SSE as trailing events (the response's own array is
    // empty on the stream), collected per spec, axis-keyed.
    const [facetsBySpec, setFacetsBySpec] = useState<Record<string, Record<string, any>>>({});
    const [entityOptionsBySpec, setEntityOptionsBySpec] = useState<EntityOptionsBySpec>({});
    // Trailing place_options events, spec_id- and scope-keyed: prefetched
    // observationAbout peers/children candidates so PlaceEditor can open
    // with no /api/search/options round trip once they've arrived.
    const [placeOptionsBySpec, setPlaceOptionsBySpec] = useState<PlaceOptionsBySpec>({});
    // A snapshot share's observations, read back from its pinned
    // content_version, keyed by the spec_id the share ref stores.
    const [frozenObsBySpec, setFrozenObsBySpec] = useState<Record<string, SpecObservations>>({});
    // Which share ref each replayed part's frozen observations come from
    // (see lib/search/frozenObservations.ts), set when a share's replay lands.
    const [snapshotBindings, setSnapshotBindings] = useState<SnapshotBinding[]>([]);
    // The share ref spec_ids whose snapshot fetch (`openShare`) is outstanding.
    // A part with one pending reads as observations-pending: its empty table
    // must not look like the omission copy before the frozen bytes land.
    // Cleared by a fresh run/reset like the maps above.
    const [pendingSnapshotSpecs, setPendingSnapshotSpecs] = useState<Set<string>>(new Set());
    // The share ref spec_ids whose snapshot read failed: those parts show
    // live observations, and the page names them. Cleared like the maps above.
    const [unreadableRefs, setUnreadableRefs] = useState<ReadonlySet<string>>(new Set());
    const unreadableSnapshots = useMemo(
        () => unreadableSpecIds(snapshotBindings, unreadableRefs),
        [snapshotBindings, unreadableRefs],
    );

    // The raw_text run's own controller/op.
    const runController = useRef<AbortController | null>(null);
    const runOp = useRef<number | null>(null);
    // The one in-flight edit-post controller: starting a new edit aborts
    // whatever edit post was still in flight (one controller per edit lane,
    // not a per-part map).
    const postController = useRef<{ op: number; controller: AbortController } | null>(null);
    // An edit post being in flight, as React state. The `parts` memo derives
    // `observationsPending` from it, and a ref (postController) cannot
    // trigger a re-render. Cleared on every terminal path (settle, a fresh
    // run, reset) so it can never stick true after a stream closes.
    const [editPostInFlight, setEditPostInFlight] = useState(false);
    // Every override still unconfirmed by a landed post response, folded
    // into the next post while one is in flight (carrying the first
    // forward); the indices they touch, so the same post's 'loading'
    // marking covers all of them, not just its own newest edit. Both clear
    // the moment the current post settles (isCurrent() at done/error/catch),
    // and are wiped by a fresh raw_text run.
    const pendingOverridesRef = useRef<DatasetEntriesOverride[]>([]);
    const pendingIndicesRef = useRef<Set<number>>(new Set());
    // The BASE run's own variable_text per part, fixed at response and never
    // touched by any later edit, unlike parts[i].variableText, which a
    // typed edit overwrites. Permalink replay's guard needs this stable
    // value so a chained edit is still checked against the phrase a reload
    // reproduces.
    const basePhraseByPartRef = useRef<(string | null)[]>([]);
    const opSeq = useRef(0);
    // A monotonic stamp for every place_options merge, regardless of spec or
    // scope -- PlaceOptionsEntry.arrival, read by view.ts's
    // placeOptionsSignature so PlaceEditor's effect can tell a fresh arrival
    // apart from an unrelated re-render even when the anchor itself repeats
    // (a same_shape/conjoin merge relaunching the trailing task after this
    // scope already landed).
    const placeOptionsArrivalRef = useRef(0);

    const updateRuntime = useCallback(
        (index: number, fn: (runtime: PartRuntime) => PartRuntime) => {
            setRuntimes((prev) => {
                const next = prev.slice();
                while (next.length <= index) next.push(EMPTY_RUNTIME);
                next[index] = fn(next[index]);
                return next;
            });
        },
        [],
    );

    const parts: HydratedPart[] = useMemo(() => {
        const count = Math.max(expectedParts.length, response?.parts.length ?? 0);
        // A stream that may still deliver this part's observations. The
        // base run hasn't reached `done`, an edit post is in flight, or a
        // snapshot share's frozen fetch for this spec is still outstanding.
        // All count as observations not yet arrived, the one window where
        // an empty preview must not read as a verdict (see
        // HydratedPart.observationsPending). The per-part frozen-case below
        // also guards `hydratedSpec != null && observations == null`, so a
        // part whose frozen bytes have already landed is never pending.
        const observationsStreamOpen = phase === 'loading' || editPostInFlight;

        return Array.from({ length: count }, (_, index): HydratedPart => {
            const wirePart = response?.parts[index] ?? null;
            const runtime = runtimes[index] ?? EMPTY_RUNTIME;
            const frozenRef =
                wirePart?.status === 'definite' && wirePart.spec
                    ? frozenRefSpecId(snapshotBindings, index, wirePart.spec.spec_id)
                    : null;
            const hydratedSpec =
                wirePart?.status === 'definite' && wirePart.spec
                    ? hydrateDefiniteSpec(
                          wirePart.spec,
                          obsBySpec,
                          facetsBySpec,
                          frozenRef ? frozenObsBySpec[frozenRef] : undefined,
                      )
                    : null;

            return {
                index,
                variableText: wirePart?.variable_text ?? expectedParts[index]?.variableText ?? null,
                part: wirePart,
                hydratedSpec,
                observationsPending:
                    hydratedSpec != null &&
                    hydratedSpec.observations == null &&
                    (observationsStreamOpen ||
                        (frozenRef != null && pendingSnapshotSpecs.has(frozenRef))),
                phase: runtime.phase,
                editError: runtime.editError,
            };
        });
    }, [
        expectedParts,
        response,
        runtimes,
        obsBySpec,
        facetsBySpec,
        frozenObsBySpec,
        snapshotBindings,
        phase,
        editPostInFlight,
        pendingSnapshotSpecs,
    ]);

    // Trailing per-spec events (observations / facet_options / slot_options
    // / entity_options) merge identically whichever stream they ride on:
    // the raw_text run or an edit post. Returns whether it handled `event`.
    const applyTrailingEvent = useCallback((event: SearchEvent): boolean => {
        switch (event.kind) {
            case 'observations':
                setObsBySpec((prev) => ({ ...prev, [event.spec_id]: event.observations }));
                return true;
            case 'facet_options':
                setFacetsBySpec((prev) => ({
                    ...prev,
                    [event.spec_id]: {
                        ...prev[event.spec_id],
                        [event.axis]: {
                            axis: event.axis,
                            options: event.options,
                            truncated: event.truncated ?? false,
                        },
                    },
                }));
                return true;
            case 'slot_options':
                setOptionsBySpec((prev) =>
                    mergeSlotOptionsEntry(prev, event.spec_id, keyRef(event.key), {
                        options: event.options,
                        truncated: event.truncated,
                    }),
                );
                return true;
            case 'entity_options':
                setEntityOptionsBySpec((prev) =>
                    mergeEntityOptionsEntry(prev, event.spec_id, {
                        entity_ref: event.entity_ref,
                        role: event.role,
                        options: event.options,
                        truncated: event.truncated,
                    }),
                );
                return true;
            case 'place_options':
                placeOptionsArrivalRef.current += 1;
                setPlaceOptionsBySpec((prev) =>
                    mergePlaceOptionsEntry(prev, event.spec_id, event.scope, {
                        anchor_ref: event.anchor_ref,
                        options: event.options,
                        truncated: event.truncated,
                        arrival: placeOptionsArrivalRef.current,
                    }),
                );
                return true;
            default:
                return false;
        }
    }, []);

    // Keyed by part index, guarded against basePhraseByPartRef's base-run
    // phrase, never the posted entry's own or the landed part's rewritten
    // text. Otherwise a second edit on the same part would inherit an
    // already-edited phrase as its own guard.
    const recordEdits = useCallback((entries: DatasetResubmitEntry[], touchedIndices: number[]) => {
        setEditsByPart((prev) =>
            nextEditsByPart(prev, entries, touchedIndices, basePhraseByPartRef.current),
        );
    }, []);

    const runBaseStream = useCallback(
        (
            op: number,
            controller: AbortController,
            input: Extract<SearchInput, { kind: 'raw_text' | 'dataset_resubmit' }>,
            onResponse?: (normalized: Resolution) => void,
        ) => {
            const isCurrent = () => runOp.current === op;

            resolveStream(
                buildRequest(input, true),
                (event) => {
                    if (!isCurrent()) return;
                    if (applyTrailingEvent(event)) return;
                    switch (event.kind) {
                        case 'interpretation':
                            setExpectedParts(
                                event.variables.map((variableText, i) => ({
                                    index: i,
                                    variableText: variableText ?? '',
                                })),
                            );
                            setRuntimes(event.variables.map(() => EMPTY_RUNTIME));
                            break;
                        case 'step':
                            if (!event.ran) break;
                            if (event.variable_index == null) {
                                setSharedSteps((prev) => addStep(prev, event.step));
                            } else {
                                const partIndex = event.variable_index;
                                setPartSteps((prev) => {
                                    const next = prev.slice();
                                    next[partIndex] = addStep(next[partIndex] ?? [], event.step);
                                    return next;
                                });
                            }
                            break;
                        // `shape` carries variable_index too (would map the
                        // same way as `step`), but nothing renders its
                        // payload. A deliberate no-op.
                        case 'shape':
                            break;
                        case 'sentence':
                            setPartSentencePlans((prev) => {
                                const next = prev.slice();
                                next[event.variable_index] = event.sentence_plan;
                                return next;
                            });
                            break;
                        case 'response': {
                            const normalized = event.response as ResolveResponse;
                            // A catalogue or declined answer has no parts:
                            // the run settles on its own `done` with no
                            // skeleton to size and nothing to replay.
                            if (normalized.kind !== 'resolution') {
                                setAnswer(normalized);
                                setExpectedParts([]);
                                setRuntimes([]);
                                break;
                            }
                            setResponse(normalized);
                            // Re-derive from the confirmed parts, not just
                            // seed-if-empty: a variables_clamped request can
                            // shrink the count interpretation promised.
                            setExpectedParts(
                                normalized.parts.map((part, i) => ({
                                    index: i,
                                    variableText: part.variable_text ?? '',
                                })),
                            );
                            setRuntimes((prev) =>
                                normalized.parts.map((_, i) => prev[i] ?? EMPTY_RUNTIME),
                            );
                            basePhraseByPartRef.current = normalized.parts.map(
                                (part) => part.variable_text ?? null,
                            );
                            onResponse?.(normalized);
                            break;
                        }
                        case 'done':
                            // Warnings and departures the engine reports
                            // after `response` already went out (e.g. a
                            // deadline-driven observations omission, or
                            // modelled values found in the read) merge
                            // into the part they name.
                            setResponse((prev) => (prev ? applyDoneEvent(prev, event) : prev));
                            setPhase('done');
                            // An edit post already in flight (fired between
                            // this run's own `response` and `done`, exactly
                            // what permalink replay does) owns the final
                            // phase for whichever parts it's touching.
                            // Stamping every part 'done' here would flip
                            // those back while the post is still resolving.
                            if (!postController.current) {
                                setRuntimes((prev) =>
                                    prev.map((r) =>
                                        r.phase === 'error'
                                            ? r
                                            : { ...r, phase: 'done' as PartPhase },
                                    ),
                                );
                            }
                            break;
                        case 'error':
                            setError(event.detail);
                            setPhase('error');
                            break;
                    }
                },
                controller.signal,
            ).catch((err: Error) => {
                if (!isCurrent() || err.name === 'AbortError') return;
                setError(err.message);
                setPhase('error');
            });
        },
        [applyTrailingEvent],
    );

    const startRun = useCallback(
        (
            input: Extract<SearchInput, { kind: 'raw_text' | 'dataset_resubmit' }>,
            label: string,
            onResponse?: (normalized: Resolution) => void,
        ) => {
            // A fresh query replaces everything: abort the previous full run
            // and any edit post in flight.
            runController.current?.abort();
            postController.current?.controller.abort();
            postController.current = null;
            setEditPostInFlight(false);
            pendingOverridesRef.current = [];
            pendingIndicesRef.current = new Set();
            basePhraseByPartRef.current = [];

            const controller = new AbortController();
            const op = ++opSeq.current;

            runController.current = controller;
            runOp.current = op;

            setPhase('loading');
            setQuery(label);
            setError(null);
            setSharedSteps([]);
            setPartSteps([]);
            setPartSentencePlans([]);
            setResponse(null);
            setAnswer(null);
            setExpectedParts([]);
            setRuntimes([]);
            setEditsByPart({});
            setObsBySpec({});
            setOptionsBySpec({});
            setFacetsBySpec({});
            setEntityOptionsBySpec({});
            setPlaceOptionsBySpec({});
            setFrozenObsBySpec({});
            setSnapshotBindings([]);
            setPendingSnapshotSpecs(new Set());
            setUnreadableRefs(new Set());

            runBaseStream(op, controller, input, onResponse);
        },
        [runBaseStream],
    );

    /** A fresh raw_text query. Full replace: every part and any edit post in
     *  flight is gone the moment this starts. */
    const run = useCallback(
        (input: Extract<SearchInput, { kind: 'raw_text' }>, label: string) => {
            startRun(input, label);
        },
        [startRun],
    );

    /** Abort anything in flight and drop back to a pristine idle run state. */
    const reset = useCallback(() => {
        runController.current?.abort();
        postController.current?.controller.abort();
        postController.current = null;
        setEditPostInFlight(false);
        pendingOverridesRef.current = [];
        pendingIndicesRef.current = new Set();
        basePhraseByPartRef.current = [];
        runOp.current = null;

        setPhase('idle');
        setQuery('');
        setError(null);
        setSharedSteps([]);
        setPartSteps([]);
        setPartSentencePlans([]);
        setResponse(null);
        setAnswer(null);
        setExpectedParts([]);
        setRuntimes([]);
        setEditsByPart({});
        setObsBySpec({});
        setOptionsBySpec({});
        setFacetsBySpec({});
        setEntityOptionsBySpec({});
        setPlaceOptionsBySpec({});
        setFrozenObsBySpec({});
        setSnapshotBindings([]);
        setPendingSnapshotSpecs(new Set());
        setUnreadableRefs(new Set());
    }, []);

    /** The starting point with no search call: a settled catalogue answer
     *  with no place, under `label`. */
    const showStartingPoint = useCallback(
        (label: string) => {
            reset();
            setPhase('done');
            setQuery(label);
            setAnswer({ kind: 'catalogue', scope: { place: null } });
        },
        [reset],
    );

    const runDatasetStream = useCallback(
        (
            op: number,
            controller: AbortController,
            entries: DatasetResubmitEntry[],
            basisParts: HydratedPart[],
            touchedIndices: number[],
            rawQuery: string,
        ) => {
            const isCurrent = () => postController.current?.op === op;
            // Settling clears the pending-override queue only when nothing
            // has superseded this post: a superseded post's settle (its own
            // abort's catch) must never clobber what the superseding post
            // already queued.
            const settle = () => {
                if (isCurrent()) {
                    postController.current = null;
                    setEditPostInFlight(false);
                    pendingOverridesRef.current = [];
                    pendingIndicesRef.current = new Set();
                }
            };
            const fail = (detail: string, pointer: string | null | undefined) => {
                const index = pointerEntryIndex(pointer, entries.length);
                const targets = index != null ? [index] : touchedIndices;

                setRuntimes((prev) =>
                    prev.map((r, i) =>
                        targets.includes(i)
                            ? { ...r, phase: 'error' as PartPhase, editError: detail }
                            : r,
                    ),
                );
            };

            resolveStream(
                buildRequest(
                    {
                        kind: 'dataset_resubmit',
                        entries,
                        // Optional and echo-only, but the wire rejects an
                        // empty string outright (min length 1). Omit it
                        // rather than send '' when there's nothing to echo.
                        ...(rawQuery ? { raw_query: rawQuery } : {}),
                    },
                    true,
                ),
                (event) => {
                    if (!isCurrent()) return;
                    if (applyTrailingEvent(event)) return;
                    switch (event.kind) {
                        case 'response': {
                            const normalized = event.response as ResolveResponse;
                            // dataset_resubmit skips extraction, so it only
                            // ever answers with a resolution.
                            if (normalized.kind !== 'resolution') {
                                fail(`Unexpected ${normalized.kind} answer to an edit.`, null);
                                break;
                            }
                            const restored = restorePlaceholderParts(
                                normalized,
                                basisParts.map((p) => p.part),
                                entries.length,
                            );

                            setResponse(restored);
                            setExpectedParts(
                                restored.parts.map((part, i) => ({
                                    index: i,
                                    variableText:
                                        part.variable_text ?? basisParts[i]?.variableText ?? '',
                                })),
                            );
                            setRuntimes((prev) =>
                                restored.parts.map((_, i) => ({
                                    ...(prev[i] ?? EMPTY_RUNTIME),
                                    phase: 'done' as PartPhase,
                                    editError: null,
                                })),
                            );
                            recordEdits(entries, touchedIndices);
                            break;
                        }
                        case 'done':
                            // Same late merge as the raw_text loop
                            // (runBaseStream): a dataset_resubmit post
                            // streams the same event shape.
                            setResponse((prev) => (prev ? applyDoneEvent(prev, event) : prev));
                            settle();
                            break;
                        case 'error':
                            fail(event.detail, event.pointer);
                            settle();
                            break;
                        // interpretation/step/shape/sentence never arrive on
                        // this door.
                        default:
                            break;
                    }
                },
                controller.signal,
            ).catch((err: Error & { pointer?: string | null }) => {
                if (!isCurrent()) return;
                settle();
                if (err.name === 'AbortError') return;
                fail(err.message, err.pointer);
            });
        },
        [applyTrailingEvent, recordEdits],
    );

    /** Posts one `dataset_resubmit` edit. `override` folds onto whatever
     *  overrides are still unconfirmed (a post already in flight), or onto
     *  fresh `parts`/`basisParts` when nothing is. Aborts any
     *  edit post in flight; marks every part the accumulated overrides touch
     *  'loading', and clears that marker from any other part a superseded
     *  post had set it on. `basisParts` defaults to the hook's own `parts`;
     *  `replay` passes a fresh view built straight off a just-landed
     *  response, since React hasn't re-rendered `parts` from it yet. */
    const runDatasetEdit = useCallback(
        (
            override: DatasetEntriesOverride | DatasetEntriesOverride[],
            touchedIndices: number[],
            basisParts: HydratedPart[] = parts,
            // `replay` passes `state.query` explicitly: it fires synchronously
            // inside the base run's own `response` handler, before React has
            // re-rendered with the `setQuery` that run just issued, so the
            // `query` closure below would still read the previous run's text
            // (or '' on a cold load).
            rawQuery: string = query,
        ) => {
            const carriedOverrides = postController.current ? pendingOverridesRef.current : [];
            const carriedIndices = postController.current
                ? pendingIndicesRef.current
                : new Set<number>();
            const overrides = [
                ...carriedOverrides,
                ...(Array.isArray(override) ? override : [override]),
            ];
            const indices = new Set([...carriedIndices, ...touchedIndices]);

            const entries = buildDatasetEntries(basisParts, overrides);

            pendingOverridesRef.current = overrides;
            pendingIndicesRef.current = indices;

            postController.current?.controller.abort();
            const controller = new AbortController();
            const op = ++opSeq.current;
            postController.current = { op, controller };
            setEditPostInFlight(true);

            setRuntimes((prev) =>
                prev.map((r, i) => ({
                    ...r,
                    phase: indices.has(i)
                        ? ('loading' as PartPhase)
                        : r.phase === 'loading'
                          ? ('done' as PartPhase)
                          : r.phase,
                    editError: indices.has(i) ? null : r.editError,
                })),
            );

            runDatasetStream(op, controller, entries, basisParts, [...indices], rawQuery);
        },
        [parts, query, runDatasetStream],
    );

    const identityOverrideEntry = useCallback(
        (partIndex: number, fromSpec: any, identity: BaseIdentity): DatasetIdentityEntry => ({
            entry_kind: 'identity',
            variable_text: parts[partIndex]?.variableText ?? '',
            identity,
            ...specEntityGroups(fromSpec),
        }),
        [parts],
    );

    // Slot edit: route the resolved-slot binding to the right member of the
    // identity (what/how slot, the sentence token's where role, or the source
    // facet). See promote.ts's withResolvedSlotEdit for the routing.
    const editSlot = useCallback(
        (
            partIndex: number,
            fromSpec: any,
            slotIndex: number,
            binding: any,
            entityRole: EntityRoleKey = 'observationAbout',
        ) => {
            const identity = withResolvedSlotEdit(fromSpec, slotIndex, binding, entityRole);
            const entry = identityOverrideEntry(partIndex, fromSpec, identity);

            runDatasetEdit({ index: partIndex, entry }, [partIndex]);
        },
        [identityOverrideEntry, runDatasetEdit],
    );

    // A null/empty dcids is the unbind row or an Apply with nothing checked,
    // which drops the role from the identity.
    const editEntity = useCallback(
        (partIndex: number, fromSpec: any, role: RoleAxis, dcids: string[] | null) => {
            const identity = withEntityEdit(fromSpec.identity as BaseIdentity, role, dcids);
            const entry = identityOverrideEntry(partIndex, fromSpec, identity);

            runDatasetEdit({ index: partIndex, entry }, [partIndex]);
        },
        [identityOverrideEntry, runDatasetEdit],
    );

    // A deliberate date edit sets identity.requested_window directly. 'when'
    // is not an identity slot, so the edit needs no slot binding at all.
    const editWindow = useCallback(
        (partIndex: number, fromSpec: any, window: WindowApplyValue) => {
            const identity: BaseIdentity = {
                ...(fromSpec.identity as BaseIdentity),
                requested_window: window,
            };
            const entry = identityOverrideEntry(partIndex, fromSpec, identity);

            runDatasetEdit({ index: partIndex, entry }, [partIndex]);
        },
        [identityOverrideEntry, runDatasetEdit],
    );

    // One part's facet-axis edit: binds the axis, or drops it.
    const facetOverride = useCallback(
        <A extends IdentityFacetAxis>(
            partIndex: number,
            fromSpec: any,
            axis: A,
            binding: IdentityFacets[A] | null,
        ): DatasetEntriesOverride => {
            const identity = withFacetEdit(fromSpec.identity as BaseIdentity, axis, binding);

            return {
                index: partIndex,
                entry: identityOverrideEntry(partIndex, fromSpec, identity),
            };
        },
        [identityOverrideEntry],
    );

    // Facet-axis edit with no sentence slot (the unit's request, the
    // measurement method).
    const editFacet = useCallback(
        <A extends IdentityFacetAxis>(
            partIndex: number,
            fromSpec: any,
            axis: A,
            binding: IdentityFacets[A] | null,
        ) => {
            runDatasetEdit(facetOverride(partIndex, fromSpec, axis, binding), [partIndex]);
        },
        [facetOverride, runDatasetEdit],
    );

    // Candidate promote: post the candidate's own identity verbatim.
    const pickCandidate = useCallback(
        (partIndex: number, candidate: any) => {
            const entry = identityOverrideEntry(partIndex, candidate, candidate.identity);

            runDatasetEdit({ index: partIndex, entry }, [partIndex]);
        },
        [identityOverrideEntry, runDatasetEdit],
    );

    // One post for every part a pick switches: a shared unit token's
    // price-basis switch moves each part to its own sibling measure.
    const editMeasure = useCallback(
        (picks: readonly MeasurePick[]) => {
            runDatasetEdit(
                picks.map(({ partIndex, measure }) => ({
                    index: partIndex,
                    entry: measureSwitchEntry(
                        parts[partIndex]?.variableText ?? '',
                        measure,
                        parts[partIndex]?.hydratedSpec,
                    ),
                })),
                picks.map(({ partIndex }) => partIndex),
            );
        },
        [parts, runDatasetEdit],
    );

    // Posts part as a parsed entry. Its required variable_text needs no
    // separate top-level echo the way the other three entry kinds do.
    const editParsed = useCallback(
        (partIndex: number, part: ParsedPart) => {
            runDatasetEdit({ index: partIndex, entry: { entry_kind: 'parsed', part } }, [
                partIndex,
            ]);
        },
        [runDatasetEdit],
    );

    // Runs the query, then, right after its own `response` event, builds one
    // entries list from the fresh parts with every stored edit applied as an
    // override at its own index, and posts it once. Not a chain of
    // per-part resubmits: a chain costs N+1 round trips and can silently
    // drop an earlier edit when a later hop lands as candidates. An edit
    // whose part no longer asks the same variable is skipped with a
    // one-line note on that block instead.
    const replay = useCallback(
        (state: PermalinkState) => {
            startRun({ kind: 'raw_text', query: state.query }, state.query, (normalized) => {
                const basisParts = partsFromResponse(normalized);
                const { overrides, touched, stale } = buildReplayPlan(
                    state.edits,
                    normalized.parts,
                );

                for (const index of stale) {
                    updateRuntime(index, (r) => ({
                        ...r,
                        editError: 'This edit no longer applies to the current query.',
                    }));
                }

                if (overrides.length === 0) return;

                runDatasetEdit(overrides, touched, basisParts, state.query);
            });
        },
        [startRun, updateRuntime, runDatasetEdit],
    );

    // A shared search link (see lib/search/searchShare): the stored parts
    // replay straight through `dataset_resubmit` — no language model, the
    // same datasets the sharer saw, with the operations their question asked.
    // A snapshot link also reads each part's frozen observations back from
    // dfo-apis and lays them over the live observations.
    const openShare = useCallback(
        (shared: OpenedSearchShare) => {
            const entries: DatasetResubmitEntry[] = shared.refs.map(sharedRefEntry);

            // The replay's part `i` answers ref `i`. A snapshot reads its
            // frozen observations through that ref, whatever spec_id comes back.
            // A version link has no question; the wire refuses an empty
            // raw_query.
            startRun(
                {
                    kind: 'dataset_resubmit',
                    entries,
                    ...(shared.query ? { raw_query: shared.query } : {}),
                },
                shared.query,
                shared.mode === 'snapshot'
                    ? (resolution) =>
                          setSnapshotBindings(bindSnapshotParts(shared.refs, resolution))
                    : undefined,
            );

            if (shared.mode !== 'snapshot') {
                return;
            }

            const op = runOp.current;

            for (const ref of shared.refs) {
                // A ref shared without a content_version has no frozen rows,
                // so it shows live data and the page names it as such.
                if (!ref.contentVersion) {
                    setUnreadableRefs((prev) => new Set(prev).add(ref.specId));
                    continue;
                }

                // Pending while the frozen fetch is outstanding, so an empty
                // part stays in the pending line instead of reading as the
                // omission copy before its rows land. Cleared in both
                // settlement paths, guarded by the same `runOp` currency
                // check the `.then` uses, so a superseded run's abort cannot
                // clear a newer run's registration. A failed fetch (null)
                // clears it too rather than stranding the part pending.
                setPendingSnapshotSpecs((prev) => new Set(prev).add(ref.specId));

                void fetchSnapshotObservations(ref.specId, ref.contentVersion)
                    .then((obs) => {
                        if (obs && runOp.current === op) {
                            setFrozenObsBySpec((prev) => ({ ...prev, [ref.specId]: obs }));
                        }

                        if (!obs && runOp.current === op) {
                            setUnreadableRefs((prev) => new Set(prev).add(ref.specId));
                        }

                        if (runOp.current === op) {
                            setPendingSnapshotSpecs((prev) => {
                                const next = new Set(prev);
                                next.delete(ref.specId);
                                return next;
                            });
                        }
                    })
                    .catch(() => {
                        if (runOp.current === op) {
                            setUnreadableRefs((prev) => new Set(prev).add(ref.specId));
                            setPendingSnapshotSpecs((prev) => {
                                const next = new Set(prev);
                                next.delete(ref.specId);
                                return next;
                            });
                        }
                    });
            }
        },
        [startRun],
    );

    const edits = useMemo(
        () => Object.values(editsByPart).sort((a, b) => a.part - b.part),
        [editsByPart],
    );

    // A hoisted qualifier's edit: every definite part carries its own copy of
    // the axis (that's what let it hoist), so rewrite it in every one of
    // their entries and post them all together in one `dataset_resubmit`. A
    // part that's candidates/no_data/unsupported/still loading has nothing
    // of its own to edit yet and is left alone. `origin` (the provider) isn't a
    // slot: it lives on the spec's entities, not `identity.slots`. It routes
    // to `withEntityEdit` on every definite part whose spec has one, instead
    // of the slot lookup below.
    const editShared = useCallback(
        (edit: SharedEdit) => {
            if (edit.axis === 'unit') {
                const unitEdit = sharedUnitEdit(parts, edit.request);

                if (unitEdit) runDatasetEdit(unitEdit.override, unitEdit.touched);
                return;
            }

            // One override per part, each from its own identity. Only a choice every bound part offers goes
            // out (`sharedMethodServes`), the choices the shared menu lists.
            if (edit.axis === 'method') {
                const bound = parts.filter(
                    (part) => part.part?.status === 'definite' && bindsMethod(part.hydratedSpec),
                );

                if (
                    bound.length === 0 ||
                    !sharedMethodServes(
                        bound.map((part) => part.hydratedSpec),
                        edit.binding,
                    )
                ) {
                    return;
                }

                runDatasetEdit(
                    bound.map((part) =>
                        facetOverride(
                            part.index,
                            part.hydratedSpec,
                            'measurementMethod',
                            edit.binding,
                        ),
                    ),
                    bound.map((part) => part.index),
                );
                return;
            }

            const touched: number[] = [];

            for (const part of parts) {
                if (part.part?.status !== 'definite' || !part.hydratedSpec) continue;
                const spec = part.hydratedSpec;

                if (edit.axis === 'entity') {
                    if (entityOptionsEntry(spec, entityOptionsBySpec, edit.role)) {
                        touched.push(part.index);
                    }
                    continue;
                }
                if (spec.slots.some((slot) => slot.key.axis === edit.axis))
                    touched.push(part.index);
            }

            if (touched.length === 0) return;

            const rewriteIdentity = (identity: BaseIdentity, part: HydratedPart): BaseIdentity => {
                if (!touched.includes(part.index) || !part.hydratedSpec) return identity;
                const spec = part.hydratedSpec;

                if (edit.axis === 'entity') {
                    return withEntityEdit(identity, edit.role, [edit.dcid]);
                }
                if (edit.axis === 'when') {
                    return { ...identity, requested_window: edit.window };
                }
                const slotIndex = spec.slots.findIndex((slot) => slot.key.axis === edit.axis);
                return withResolvedSlotEdit(
                    spec,
                    slotIndex,
                    edit.binding,
                    edit.axis === 'where' ? edit.entityRole : 'observationAbout',
                );
            };

            runDatasetEdit({ rewriteIdentity }, touched);
        },
        [entityOptionsBySpec, facetOverride, parts, runDatasetEdit],
    );

    return {
        phase,
        query,
        error,
        sharedSteps,
        partSteps,
        partSentencePlans,
        response,
        answer,
        parts,
        expectedParts,
        optionsBySpec,
        entityOptionsBySpec,
        placeOptionsBySpec,
        edits,
        unreadableSnapshots,
        run,
        showStartingPoint,
        reset,
        replay,
        openShare,
        editSlot,
        editEntity,
        editWindow,
        editFacet,
        pickCandidate,
        editMeasure,
        editParsed,
        editShared,
    };
};
