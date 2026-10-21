/* eslint-disable @typescript-eslint/no-explicit-any -- reads specs and options of either picker shape as `any`, each helper dereferencing only the members it names and tolerating any that is missing */
/**
 * View helpers: flatten a resolved Spec into UI-ready rows and summaries.
 * Deliberately defensive — the engine contract is authoritative, the UI reads
 * only what it can render and falls back to em dashes.
 */

import { originLine, viaLabel } from '../dataCommons.ts';
import { capitalise } from '../capitalise.ts';
import { spaceCamel } from '../spaceCamel.ts';
import type { MemberRef, MembersRead } from './definitionMembers.ts';
import { coverageRichness, coverageState, partitionOptions } from './optionCoverage.ts';
import type { OperationProgress } from './operationPoll';
import { entityChoiceGroups } from './parsedEdit.ts';
import type { EntityChoiceGroup } from './parsedEdit.ts';
import { entityOptionDcid } from './pickerState.ts';
import type { OptionLike } from './pickerState.ts';
import type { ApiError, EntityOption } from './searchClient';
import {
    type Assumption,
    type EntityOptions,
    type EntityRoleKey,
    type FacetBasis,
    type ObservationSeries,
    type GraphRef,
    hasKey,
    type IdentityFacetBinding,
    type Known,
    type NoData,
    type NoDataDenominator,
    type NoDataGate,
    type NoDataReason,
    type ObservationsOmission,
    type ObservationsOmissionReason,
    type ParsedPart,
    type Part,
    type PartyKind,
    type PlaceOptionsScope,
    type RoleAxis,
    type SentenceToken,
    type Slot,
    type SlotOption,
    type Spec,
    type UnitAlternative,
    type Warning,
} from './types.ts';
import { keyRef, sentenceOf } from './searchClient.ts';
import { unitWithBasis } from './unitLabel.ts';

/** Display label of a slot/entity option, wherever the engine put it. */
export const optionLabel = (option: OptionLike | null | undefined): string =>
    option?.value?.ref?.label ?? option?.label ?? '—';

/** True when searchClient.flattenSpec couldn't read this spec's `stat_vars`
 *  as the wire's ResolvedStatVars object shape — it already logged the raw
 *  value to the console at parse time. A card reading this spec's variable
 *  label should show an explicit failure state rather than an empty one. */
export const statVarsUnreadable = (spec: any): boolean => !!spec?.stat_vars_unreadable;

/** The resolved spec's measure, named for a card whose part carries no
 *  variable_text: its measure label, else its shape's label. Null when
 *  neither is stated — check statVarsUnreadable first to tell an unread
 *  spec from an unnamed one. */
export const primaryStatVarLabel = (spec: any): string | null =>
    spec?.measure_label ?? spec?.shape?.label ?? null;

/** A part's own variable_text for a card standing in for that part, or the
 *  full original question when the fallback needs more than the bare
 *  variable. */
export const cardText = (spec: any, fallbackText?: string | null): string | undefined =>
    sentenceOf(spec)?.rendered_sentence ?? fallbackText ?? undefined;

/** One facet axis's observed choices off `spec.facet_options`, deduped by
 *  ref, in the engine's own rank order (in-window observation count). An
 *  option with no ref (measurementMethod and unit only) stands for the
 *  facets that declare no value on the axis, and is kept once. */
const facetAxisOptions = (
    spec: Pick<Spec, 'facet_options'> | null | undefined,
    axis: string,
): SlotOption[] => {
    const seen = new Set<string | null>();
    const out: SlotOption[] = [];

    (spec?.facet_options ?? [])
        .filter((entry) => entry.axis === axis)
        .forEach((entry) => {
            entry.options.forEach((option) => {
                const { value } = option;

                if (value.ref && !value.ref.ref) {
                    return;
                }

                const ref: string | null = value.ref?.ref ?? null;

                if (seen.has(ref)) {
                    return;
                }

                seen.add(ref);
                out.push({ value });
            });
        });

    return out;
};

/**
 * Data-source choices for the source slot. The engine ships no slot_options
 * for that axis. The same refs ride the facet_options' provenance entries
 * (value_kind "source"), and a spec_resubmit with a source-slot binding of
 * such a ref comes back definite with the sentence gaining "according to …".
 * Reshaped to the slot-option contract so the pickers treat them uniformly.
 */
export const sourceSlotOptions = (spec: any): SourceSlotOption[] =>
    facetAxisOptions(spec, 'provenance').filter(
        (option): option is SourceSlotOption =>
            !!option.value.ref && option.value.value_kind === 'source',
    );

/** A source slot's option: a provenance, so its value always carries a ref. */
export type SourceSlotOption = SlotOption & { value: { ref: GraphRef } };

/**
 * Provenance labels arrive dcid-squished ("WorldDevelopmentIndicators") while
 * the engine's own rendered sentence spaces them out — mirror that spacing.
 */
export const sourceOptionLabel = (option: OptionLike | null | undefined): string =>
    optionLabel(option)
        .replace(/_/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2');

/** A provenance ref's publisher and origin, display-ready: "World Bank via
 *  Data Commons by Google", or the publisher alone for DFO data. A UN agency
 *  provenance is its own source, so it reads "via UN System Data Commons"
 *  beside its own label. Reads any ref carrying `source` and `data_commons`
 *  (a ProvenanceRef, a series' facet.provenance, resolved.facets.provenance,
 *  a ShapeUpstream). */
export const provenanceOrigin = (provenance: any): string | null =>
    originLine(provenance?.ref, provenance?.source, provenance?.data_commons);

/** A candidate's origin before any series is read, from its shape: the one
 *  upstream source when there is one, else the Data Commons holding its
 *  variables. Null when DFO is among them, because at a place both hold the
 *  series serves DFO's data. */
export const shapeOrigin = (shape: any): string | null => {
    if (shape?.upstream) {
        return provenanceOrigin(shape.upstream);
    }

    const origins: any[] = shape?.data_commons ?? [];

    if (origins.some((origin) => origin?.id === 'dfo')) {
        return null;
    }

    const labels = origins.map((origin) => origin?.label).filter(Boolean);

    return labels.length ? `via ${labels.join(' and ')}` : null;
};

/** The provenance dcids a spec's own sentence names in its source slot: the
 *  bound source values, else the resolved sources the engine renders when
 *  the slot is unbound. Empty when the sentence names no source. */
const sentenceSourceRefs = (spec: any): string[] => {
    const named = (spec?.sentence_plan ?? []).some(
        (token: any) => token?.kind === 'slot' && token.axis === 'source' && token.text,
    );

    if (!named) {
        return [];
    }

    const binding = (spec?.slots ?? []).find((slot: any) => slot?.key?.axis === 'source')?.binding;
    const refs: any[] =
        binding?.kind === 'value'
            ? [binding.value?.ref]
            : binding?.kind === 'set'
              ? binding.values.map((value: any) => value?.ref)
              : (spec?.resolution?.resolved_sources ?? []);

    return refs.map((ref) => ref?.ref).filter(Boolean);
};

/** The origin beside a title built from the spec's own sentence (a
 *  candidate card, a Choose a Match row): shapeOrigin, less the publisher
 *  when the sentence's source slot already names it. A UN agency answer
 *  reads "... according to United Nations Children's Fund", so its line is
 *  "via UN System Data Commons" alone. */
export const specOrigin = (spec: any): string | null => {
    const upstream = spec?.shape?.upstream;

    if (upstream && sentenceSourceRefs(spec).includes(upstream.source?.ref)) {
        return viaLabel(upstream.data_commons);
    }

    return shapeOrigin(spec?.shape);
};

/** The origin of one of the spec's provenances, by dcid, from whichever
 *  provenance refs the spec carries: the trace's resolved_sources,
 *  resolved.facets.provenance, then each series' source_refs. The source
 *  picker's options are bare GraphRefs, so this is how they get theirs. */
export const sourceOrigin = (spec: any, dcid: string): string | null => {
    const refs: any[] = [
        ...(spec?.resolution?.resolved_sources ?? []),
        spec?.facets?.provenance,
        ...(spec?.observations?.series ?? []).flatMap((series: any) => series?.source_refs ?? []),
    ];

    return provenanceOrigin(refs.find((ref) => ref?.ref === dcid));
};

/** The dynamic fields emitted by a trailing entity_options SSE event. `source`
 * is response-only metadata, so the event map intentionally stores only the
 * fields its event carries. */
export type EntityOptionsEntry = Pick<
    EntityOptions,
    'entity_ref' | 'role' | 'options' | 'truncated'
>;

export type EntityOptionsBySpec = Record<string, EntityOptionsEntry[]>;

/** Fold one trailing entity_options event into its spec-keyed map without
 * losing the event's truncation state. */
export const mergeEntityOptionsEntry = (
    bySpec: EntityOptionsBySpec,
    specId: string,
    entry: EntityOptionsEntry,
): EntityOptionsBySpec => ({
    ...bySpec,
    [specId]: [...(bySpec[specId] ?? []), entry],
});

/** Look up one directional entity axis without assuming it is the provider.
 * Sentence tokens carry the authoritative role, including an open
 * destination that identity.entities does not yet contain. */
export const entityOptionsEntry = (
    spec: any,
    entityOptionsBySpec: EntityOptionsBySpec,
    role: RoleAxis,
): EntityOptionsEntry | undefined =>
    (entityOptionsBySpec[spec?.spec_id] ?? []).find((entry) => entry.role === role);

export const entitySlotOptions = (
    spec: any,
    entityOptionsBySpec: EntityOptionsBySpec,
    role: RoleAxis,
) => entityOptionsEntry(spec, entityOptionsBySpec, role)?.options ?? [];

/** Candidate choices that are safe to apply to every definite part behind a
 * shared directional token. A representative part may offer a recipient the
 * others cannot accept, so a hoisted menu may only expose the intersection. */
export const sharedEntityOptions = (
    specs: any[],
    entityOptionsBySpec: EntityOptionsBySpec,
    role: RoleAxis,
): EntityOptionsEntry | undefined => {
    const entries = specs.map((spec) => entityOptionsEntry(spec, entityOptionsBySpec, role));
    const completeEntries = entries.filter(
        (entry): entry is EntityOptionsEntry => entry !== undefined,
    );

    if (completeEntries.length === 0 || completeEntries.length !== entries.length) return undefined;

    const [first, ...rest] = completeEntries;
    const options = first.options.filter((option) => {
        const dcid = option.value.ref?.ref;
        return (
            dcid &&
            rest.every((entry) => entry.options.some((other) => other.value.ref?.ref === dcid))
        );
    });

    return {
        ...first,
        options,
        // An intersection is complete only when every contributing list was
        // complete. The UI must keep the distinction for count-only axes.
        truncated: completeEntries.some((entry) => entry.truncated),
    };
};

/** Shared directional tokens are edited in two distinct ways. An open token
 * can fan a common option to each part; a bound read-back token must refine
 * the whole sentence so a representative option cannot overwrite siblings. */
export const sharedDirectionalEditRoute = (
    entityRefs: string[] | undefined,
    sharedEntry: EntityOptionsEntry | undefined,
): 'shared-options' | 'bound-refine' | 'unavailable' => {
    if (entityRefs?.length) return 'bound-refine';
    return sharedEntry?.options.length ? 'shared-options' : 'unavailable';
};

/** The dcid of a spec's currently-bound entity for a directional role. */
export const currentEntityDcid = (spec: any, role: EntityRoleKey): string | undefined =>
    (spec?.entities ?? []).find((entity: any) => entity.role === role)?.ref;

/** An open directional axis has no entity_ref but still exposes its own
 * candidate set. Add Criteria uses this for the origin axis, whose sentence
 * plan deliberately has no token while it is open. */
export const openEntityEntry = (
    spec: any,
    entityOptionsBySpec: EntityOptionsBySpec,
    role: RoleAxis,
): EntityOptionsEntry | undefined => {
    const entry = entityOptionsEntry(spec, entityOptionsBySpec, role);
    return entry && !entry.entity_ref ? entry : undefined;
};

/** A set binding reads its first value as a representative anchor good
 *  enough to gate "is anything bound". currentEntityDcids is the one to
 *  read for the full bound set. */
export const anchorDcid = (token: SentenceToken, spec: any): string | undefined => {
    if (token.entity_refs?.length) return token.entity_refs[0];

    if (token.axis !== 'where') return undefined;

    const binding = (spec?.slots ?? []).find((slot: any) => slot?.key?.axis === 'where')?.binding;

    if (binding?.kind === 'value' && binding.value?.value_kind === 'entity') {
        return binding.value?.ref?.ref;
    }

    if (binding?.kind === 'set') {
        return (binding.values ?? []).find((value: any) => value?.value_kind === 'entity')?.ref
            ?.ref;
    }

    return undefined;
};

/** Plural sibling of currentEntityDcid (which stops at the first match),
 *  used wherever more than one entity can be bound to a role at once. */
export const currentEntityDcids = (spec: any, role: EntityRoleKey): string[] =>
    (spec?.entities ?? [])
        .filter((entity: any) => entity.role === role)
        .map((entity: any) => entity.ref)
        .filter((ref: unknown): ref is string => typeof ref === 'string' && ref.length > 0);

/** BindingSet is illegal at length 1, so a single ref renders as a plain
 *  value and only two or more become a set. Zero clears the slot the same
 *  way "Any place" already does. */
export const entitySlotBindingForRefs = (refs: { dcid: string; label: string }[]): any => {
    if (refs.length === 0) return { kind: 'unbound' };

    const values = refs.map((ref) => ({
        value_kind: 'entity',
        ref: { ref: ref.dcid, label: ref.label },
    }));

    return refs.length === 1 ? { kind: 'value', value: values[0] } : { kind: 'set', values };
};

/**
 * How a per-part PlaceEditor's listed pick should be posted, for a token
 * `anchorDcid` above already resolved to a place. A directional role
 * (origin/destination) always has a real entities.<role> edit to post. A
 * role-less anchor doesn't, whether its anchor came off the where slot's
 * own binding or (per anchorDcid's doc) an observationAbout token stamped
 * with entity_refs directly: useSearchRun's editEntity only accepts
 * RoleAxis ('origin' | 'destination'), not the 'observationAbout' member of
 * EntityRoleKey, so there is no onEditEntity call this router can make for
 * it. Both read the same way instead — the where slot, found the same way
 * the DEFAULT-scope PlaceScopeEditor branch finds it.
 */
export const placeEditorPickRoute = (
    token: SentenceToken,
    spec: any,
):
    | { kind: 'entity'; role: RoleAxis }
    | { kind: 'where'; whereIndex: number }
    | { kind: 'text' } => {
    if (token.role === 'origin' || token.role === 'destination') {
        return { kind: 'entity', role: token.role };
    }

    const whereIndex = (spec?.slots ?? []).findIndex((slot: any) => slot?.key?.axis === 'where');

    // No where slot to bind: the pick falls back to the typed-text path.
    return whereIndex === -1 ? { kind: 'text' } : { kind: 'where', whereIndex };
};

/**
 * Which options-door scopes PlaceEditor should request for an anchor's role.
 * A directional role (origin/destination) returns the same candidate list
 * for scope: 'peers' and scope: 'children' -- the door ignores for.scope on
 * that path -- so only 'peers' is worth asking for; the observationAbout
 * path (role omitted) also drops 'children' once the bound count isn't
 * exactly one, since "places within" needs a single anchor and the door
 * refuses `children_anchor_ambiguous` for more than one.
 */
export const placeEditorScopes = (role?: EntityRoleKey, boundCount = 1) =>
    role === 'origin' || role === 'destination' || boundCount !== 1
        ? (['peers'] as const)
        : (['peers', 'children'] as const);

/** Whether PlaceEditor should show its group headings ("Similar places" /
 *  "Within") at all: a lone group needs no label to disambiguate it from a
 *  sibling, and on the directional single-group surface (placeEditorScopes'
 *  'peers'-only path) a heading written for the subject role would be
 *  actively wrong for some of the values it labels. */
export const showGroupHeadings = (groups: { title: string }[]): boolean => groups.length > 1;

/** One scope's worth of prefetched observationAbout place candidates, folded
 *  from a trailing `place_options` SSE event — already reshaped to the flat
 *  EntityOption client shape (searchClient.ts's placeOptionValues does that
 *  at parse time), so PlaceEditor renders it exactly like a live fetch's
 *  result. `anchor_ref` is kept so a stale entry (a prior anchor's peers,
 *  still sitting in the map after the user picked a different place) is
 *  never mistaken for this anchor's own set. */
export type PlaceOptionsEntry = {
    anchor_ref: string;
    options: EntityOption[];
    truncated: boolean;
    /** Bumped once per merge into this (spec_id, scope) pair by
     *  useSearchRun.ts's applyTrailingEvent -- a monotonic arrival marker,
     *  not a count. PlaceEditor's prefetch signature (below) reads it
     *  alongside `anchor_ref` so a second event for the same pair with the
     *  *same* anchor (a same_shape/conjoin merge relaunching the trailing
     *  task after this one already landed) still counts as a fresh
     *  arrival, not a no-op re-render. Optional so a fixture built before
     *  this field existed still type-checks; a missing value reads as 0. */
    arrival?: number;
};

export type PlaceOptionsBySpec = Record<
    string,
    Partial<Record<PlaceOptionsScope, PlaceOptionsEntry>>
>;

/** A spec's prefetched place_options entries, by scope -- undefined for a
 *  spec no event has named yet (the trailing events haven't arrived, or this
 *  spec binds no observationAbout place at all). */
export const placeOptionsForSpec = (
    spec: any,
    placeOptionsBySpec: PlaceOptionsBySpec,
): Partial<Record<PlaceOptionsScope, PlaceOptionsEntry>> | undefined =>
    placeOptionsBySpec[spec?.spec_id];

/** Fold one trailing place_options event into its spec-keyed map. Unlike
 *  mergeEntityOptionsEntry's append, a (spec_id, scope) pair has at most one
 *  live entry -- a later event for the same pair (a fresh anchor after an
 *  edit) replaces it outright. */
export const mergePlaceOptionsEntry = (
    bySpec: PlaceOptionsBySpec,
    specId: string,
    scope: PlaceOptionsScope,
    entry: PlaceOptionsEntry,
): PlaceOptionsBySpec => ({
    ...bySpec,
    [specId]: { ...bySpec[specId], [scope]: entry },
});

/** The scopes PlaceEditor still has to fetch live: everything `scopes` asks
 *  for that prefetched either doesn't carry, or carries for a different
 *  anchor (the event streamed before the user's edit landed the current
 *  one). Pure so the "prefetched vs. missing" decision is testable without
 *  mounting the editor. */
export const missingPlaceOptionScopes = (
    scopes: readonly PlaceOptionsScope[],
    prefetched: Partial<Record<PlaceOptionsScope, PlaceOptionsEntry>> | undefined,
    anchorDcid: string,
): PlaceOptionsScope[] => scopes.filter((scope) => prefetched?.[scope]?.anchor_ref !== anchorDcid);

/** A primitive dependency value for PlaceEditor's reactive prefetch effect:
 *  changes exactly when one of `scopes`' own prefetched entries newly
 *  arrives, is replaced, or clears -- `anchor_ref` catches an edit
 *  reassigning the anchor, `arrival` catches a same-anchor re-arrival (see
 *  PlaceOptionsEntry's own doc). An unrelated re-render -- a different
 *  spec's place_options event, a facet_options refresh rebuilding this
 *  spec's hydrated object -- leaves every named scope's own (anchor_ref,
 *  arrival) pair unchanged, so the string stays the same and an effect
 *  depending on it doesn't rerun. A scope not in `scopes` (the sibling this
 *  editor never asked for, e.g. `children` on a directional anchor) is
 *  left out entirely, so its own arrivals don't matter here either. Pure,
 *  so "did anything worth reacting to change" is testable without mounting
 *  the editor or firing a timer.
 */
export const placeOptionsSignature = (
    scopes: readonly PlaceOptionsScope[],
    prefetched: Partial<Record<PlaceOptionsScope, PlaceOptionsEntry>> | undefined,
): string =>
    scopes
        .map((scope) => {
            const entry = prefetched?.[scope];
            return `${scope}:${entry?.anchor_ref ?? ''}:${entry?.arrival ?? 0}`;
        })
        .join('|');

/** One scope's outcome, whichever source it came from -- a prefetched
 *  place_options entry (already succeeded) or a live entityOptions() call
 *  -- folded to one shape so PlaceEditor's group-building doesn't care
 *  which. */
export type PlaceOptionScopeResult =
    | { status: 'fulfilled'; value: { options: EntityOption[]; truncated: boolean } }
    | { status: 'rejected'; reason: ApiError };

export type PlaceOptionGroups = {
    groups: { title: string; options: EntityOption[] }[];
    anySucceeded: boolean;
    lastError: ApiError | null;
};

/**
 * Turns every scope's settled outcome into PlaceEditor's rendered shape: a
 * group per scope that returned at least one option (titled "Similar
 * places"/"Within" by `scope`), whether any scope succeeded at all (a
 * refusal on one scope alone still shows the other's group -- the picker
 * only reads as failed when neither scope came back), and the last
 * refusal seen, for that failed state's message when none did. A scope
 * with no entry yet in `results` is skipped -- call this only once every
 * scope in `scopes` has settled, so the reveal happens once, not group by
 * group. Pure, so the group-building choice is testable without mounting
 * the editor or firing a timer.
 */
export const buildPlaceOptionGroups = (
    scopes: readonly PlaceOptionsScope[],
    results: ReadonlyMap<PlaceOptionsScope, PlaceOptionScopeResult>,
): PlaceOptionGroups => {
    const groups: { title: string; options: EntityOption[] }[] = [];
    let anySucceeded = false;
    let lastError: ApiError | null = null;

    for (const scope of scopes) {
        const result = results.get(scope);

        if (!result) continue;

        if (result.status === 'fulfilled') {
            anySucceeded = true;

            if (result.value.options.length) {
                groups.push({
                    title: scope === 'peers' ? 'Similar places' : 'Within',
                    options: result.value.options,
                });
            }

            continue;
        }

        lastError = result.reason;
    }

    return { groups, anySucceeded, lastError };
};

/** How long a still-missing scope waits for its own trailing place_options
 *  event before falling through to a live door call. Long enough to cover
 *  the common case, both scopes landing within a few hundred ms of
 *  `response` once the population memo is warm, short enough that a scope
 *  the server drops outright (a refused `children`, or one whose task hit
 *  the door's own 1s population-derivation cap) never costs more than this
 *  on top of the click — nothing else ends the wait for a dropped scope,
 *  since no event is ever coming for it. Lives here, not editors.tsx, so
 *  `planPlaceOptions` below is the only place that computes a fresh grace
 *  deadline. */
export const PREFETCH_GRACE_MS = 250;

/** PlaceEditor's decision for one effect run of its reactive prefetch
 *  effect, everything the effect needs to execute and nothing about how it
 *  executes it. */
export type PlaceOptionsPlan = {
    /** Scopes a matching prefetch entry newly covers this run, paired with
     *  the entry to record as that scope's settled result. A scope already
     *  in `locked` (an earlier run's own decision, live or prefetched) is
     *  never repeated here even when its prefetch entry is still sitting in
     *  `prefetched` — the first decision wins. */
    lockFromPrefetch: { scope: PlaceOptionsScope; entry: PlaceOptionsEntry }[];
    /** Scopes to send to a live entityOptions() call right now, because the
     *  base stream has already closed and nothing further can prefetch
     *  them. Non-empty only when `baseStreamOpen` is falsy. */
    dispatchNow: PlaceOptionsScope[];
    /** True once every scope is locked (this run's prefetch matches plus
     *  every earlier lock) — the effect should call its own `reveal()`,
     *  which no-ops until every locked scope has also settled a result. */
    reveal: boolean;
    /** Set whenever a scope is still missing, the base stream is still
     *  open, and nothing above already covers it: the deadline to hold
     *  (the one already committed, or a fresh `now + PREFETCH_GRACE_MS`
     *  when none exists yet) and how long from `now` until it — zero when
     *  `now` has already reached it, so the effect's timer fires on the
     *  next tick rather than waiting out a full grace period it already
     *  missed. Null whenever `reveal` or `dispatchNow` already accounts for
     *  every outstanding scope. */
    wait: { deadline: number; delayMs: number } | null;
};

/**
 * The reactive-prefetch effect's whole decision, as one pure call: given the
 * scopes PlaceEditor asked for, the spec's prefetched place_options entries,
 * the anchor and role the popover opened for, the scopes an earlier run of
 * the SAME effect already locked, whether the base run's stream can still
 * deliver a trailing event, the grace deadline already committed (null
 * before one is set), and the current time — decide which scopes to serve
 * from prefetch, which to dispatch live immediately, whether to reveal the
 * settled state, and how long to keep waiting. Mirrors PlaceEditor's effect
 * (src/components/organisms/DataSearch/editors.tsx) exactly, including its
 * role-based prefetch eligibility guard (PlaceOptionsEvent's own role is
 * always observationAbout, so a directional anchor's `prefetched` is never
 * usable — see PlaceEditor's own `prefetched` prop doc there); the effect
 * only executes what this returns, applying `lockFromPrefetch` to its own
 * `committed` ref and keeping the timer, the committed ref, and the
 * mounted guard exactly as they are. Pure, so the lock/dispatch/reveal/wait
 * decision is testable without mounting the editor or firing a timer.
 */
export const planPlaceOptions = (
    scopes: readonly PlaceOptionsScope[],
    prefetched: Partial<Record<PlaceOptionsScope, PlaceOptionsEntry>> | undefined,
    anchorDcid: string,
    role: EntityRoleKey | undefined,
    locked: ReadonlySet<PlaceOptionsScope>,
    baseStreamOpen: boolean | undefined,
    deadline: number | null,
    now: number,
): PlaceOptionsPlan => {
    const usablePrefetched =
        role === undefined || role === 'observationAbout' ? prefetched : undefined;
    const missingNow = missingPlaceOptionScopes(scopes, usablePrefetched, anchorDcid);

    const lockFromPrefetch: { scope: PlaceOptionsScope; entry: PlaceOptionsEntry }[] = [];
    const nowLocked = new Set(locked);

    for (const scope of scopes) {
        if (nowLocked.has(scope) || missingNow.includes(scope)) continue;

        const entry = usablePrefetched?.[scope];

        if (entry) {
            nowLocked.add(scope);
            lockFromPrefetch.push({ scope, entry });
        }
    }

    const stillMissing = scopes.filter((scope) => !nowLocked.has(scope));

    if (stillMissing.length === 0) {
        return { lockFromPrefetch, dispatchNow: [], reveal: true, wait: null };
    }

    if (!baseStreamOpen) {
        return { lockFromPrefetch, dispatchNow: stillMissing, reveal: false, wait: null };
    }

    const resolvedDeadline = deadline ?? now + PREFETCH_GRACE_MS;

    return {
        lockFromPrefetch,
        dispatchNow: [],
        reveal: false,
        wait: { deadline: resolvedDeadline, delayMs: Math.max(0, resolvedDeadline - now) },
    };
};

/**
 * An entity option's data footprint, when the engine counted it (include_
 * option_coverage): "40 obs" from an exact/breadth observation count, else
 * the years dimension ("24 yrs"), else nothing. Slot options read
 * `optionSeriesLabel` instead.
 */
export const optionCoverageLabel = (option: OptionLike | null | undefined): string | null => {
    const coverage = option?.coverage;

    if (!coverage) {
        return null;
    }

    const dims = (coverage.kind === 'bare' ? null : coverage.dimensions) ?? [];
    const obs =
        coverage.kind === 'exact'
            ? coverage.observation_count
            : dims.find((d) => d.label === 'observations')?.count;

    if (typeof obs === 'number') {
        return `${formatCount(obs)} obs`;
    }

    const years = dims.find((d) => d.label === 'years')?.count;

    if (typeof years === 'number') {
        return `${formatCount(years)} yrs`;
    }

    return coverage.has_data === false ? 'no data' : null;
};

/**
 * Whether a slot's options are a level-scoped menu rather than the flat/
 * seed taxonomy every other slot's option list uses. `SlotOption.relation`
 * (dfo-apis src/search/models/options.py) is populated on every option or
 * none for a given list, so checking one option settles it for the rest.
 */
export const isLevelScopedOptions = (options: readonly SlotOption[]): boolean =>
    options.length > 0 && options[0]?.relation != null;

/**
 * A level-scoped slot's options split by relation: `parent` is the one way
 * up (absent at a classification root), `children` are the ways down
 * (server-ordered richest first), and `roots` are the classification roots
 * (`SlotOptionRelation`, dfo-apis src/search/models/vocab.py: "child" |
 * "parent" | "root"). The code index's level_scoped_options sends roots for
 * an unbound slot, for a bound root (every root but the bound one), and for
 * every value of a flat code system. `member_count` is only ever set on a
 * parent, child, or root option.
 */
export type LevelPartition = {
    parent: SlotOption | null;
    children: SlotOption[];
    roots: SlotOption[];
};

export const partitionLevelOptions = (options: readonly SlotOption[]): LevelPartition => ({
    parent: options.find((option) => option?.relation === 'parent') ?? null,
    children: options.filter((option) => option?.relation === 'child'),
    roots: options.filter((option) => option?.relation === 'root'),
});

/** One root of an unbound level-scoped slot's two-level menu, with the
 *  children the wire sent under it. */
export type RootGroup = { root: SlotOption; children: SlotOption[] };

/**
 * An unbound hierarchical slot's roots, each with its children grouped by
 * `SlotOption.parent` (the root's flat dcid), roots and children in wire
 * order. The wire sends children only under the roots it sends, so a child
 * naming any other parent has no root to sit under and is left out. A flat
 * code system's roots get no children. A root with one child of the same
 * served count is that child alone.
 */
export const rootGroups = (partition: LevelPartition): RootGroup[] => {
    const byParent = new Map<string, SlotOption[]>();

    for (const child of partition.children) {
        const { parent } = child;

        if (!parent) continue;

        const siblings = byParent.get(parent);

        if (siblings) {
            siblings.push(child);
        } else {
            byParent.set(parent, [child]);
        }
    }

    return partition.roots.map((root) => {
        const dcid = root.value.ref?.ref;
        const children = dcid ? (byParent.get(dcid) ?? []) : [];
        const [only] = children;

        // A root whose one served child serves the same rows is the same
        // pick twice ("project-type intervention (group)" and "project-type
        // intervention"): the child stands for both.
        return children.length === 1 &&
            root.served_rows != null &&
            only?.served_rows === root.served_rows
            ? { root: only, children: [] }
            : { root, children };
    });
};

/**
 * A level-scoped slot's menu, decided by the slot's binding. Unbound (or
 * bound to a set, which the server menus as unbound), it is the roots with
 * their children (rootGroups). Bound to one value, it is that value as the
 * current pick between its way up (`up`, absent at a root), its ways down
 * (`down`, the children whose `parent` names the bound value), and the
 * other roots (`sideways`, grouped like an unbound menu). A bound root and
 * a flat code system's value come with other roots and no children for
 * them, so each group is a lone root. A binding the code index does not
 * hold comes back as the unbound menu, whose children all sit under other
 * roots and stay reachable there. `current` is the bound value's own
 * option when the wire lists it (a flat code system does, with its row
 * count), else the bare binding. Every list keeps the server's order.
 */
export type LevelMenu =
    | { kind: 'unbound'; groups: RootGroup[] }
    | {
          kind: 'bound';
          up: SlotOption | null;
          current: SlotOption;
          down: SlotOption[];
          sideways: RootGroup[];
      };

export const levelMenu = (
    binding: Slot['binding'] | null | undefined,
    options: readonly SlotOption[],
): LevelMenu => {
    const partition = partitionLevelOptions(options);
    const boundValue = binding?.kind === 'value' ? binding.value : null;
    const boundDcid = boundValue?.ref?.ref;

    if (!boundValue || !boundDcid) return { kind: 'unbound', groups: rootGroups(partition) };

    const { current, rest } = splitCurrentPick(partition.roots, boundDcid);
    const isDown = (child: SlotOption) => child.parent === boundDcid;

    return {
        kind: 'bound',
        up: partition.parent,
        current: current ?? { value: boundValue },
        down: partition.children.filter(isDown),
        sideways: rootGroups({
            ...partition,
            roots: rest,
            children: partition.children.filter((child) => !isDown(child)),
        }),
    };
};

/** One slot's option set as `useSearchRun`'s trailing `slot_options` events
 *  accumulate it: the whole `{options, truncated}` pair the wire event
 *  carries, not just the option list — the shape every menu renders from
 *  (see mergeSlotOptionsEntry below). */
export type SlotOptionsEntry = { options: SlotOption[]; truncated: boolean };

const EMPTY_OPTIONS_ENTRY: SlotOptionsEntry = { options: [], truncated: false };

/** One slot's entry out of `optionsBySpec`, spec_id then slot-key-ref keyed.
 *  Missing (never populated, or a different spec/key) reads as an empty,
 *  non-truncated entry rather than undefined, so a caller never needs its
 *  own fallback. */
export const slotOptionsEntry = (
    bySpec: Record<string, Record<string, SlotOptionsEntry>>,
    specId: string,
    key: string,
): SlotOptionsEntry => bySpec[specId]?.[key] ?? EMPTY_OPTIONS_ENTRY;

/** Folds one `slot_options` trailing event into the accumulated per-spec
 *  map, keeping the whole entry (options and truncated together). The
 *  event's list replaces the slot's as the server sent it: counted, with
 *  the options that serve nothing already dropped. */
export const mergeSlotOptionsEntry = (
    bySpec: Record<string, Record<string, SlotOptionsEntry>>,
    specId: string,
    key: string,
    entry: SlotOptionsEntry,
): Record<string, Record<string, SlotOptionsEntry>> => ({
    ...bySpec,
    [specId]: { ...bySpec[specId], [key]: entry },
});

/** A slot's own option label: the source axis reshapes coverage-derived
 *  facet entries (sourceOptionLabel de-camel-cases them), every other axis
 *  reads the taxonomy label directly. The one check both a bound slot's
 *  menu and Add Criteria's submenu need, so the same slot doesn't gain a
 *  different label depending on which entry point rendered it. */
export const slotOptionLabel = (slot: any, option: OptionLike): string =>
    slot?.key?.axis === 'source' ? sourceOptionLabel(option) : optionLabel(option);

/** "1,284 rows", or "up to 1,284 rows" when `exact` is false, for a count
 *  in the terms of `DownloadFacts.rows`: a slot option's or measure
 *  alternative's `served_rows`, or the answer's own `download.rows`. Null
 *  for an uncounted one. */
export const rowsLabel = (
    rows: number | null | undefined,
    exact: boolean | null | undefined,
): string | null =>
    typeof rows === 'number' ? `${exact === false ? 'up to ' : ''}${countNoun(rows, 'row')}` : null;

/** The dcids a slot binds: one for a value, each member's for a set, none
 *  when unbound. */
const slotBoundDcids = (slot: any): string[] => {
    const binding = slot?.binding;

    if (binding?.kind === 'value') return [binding.value?.ref?.ref].filter(Boolean);
    if (binding?.kind === 'set') {
        return (binding.values ?? []).map((value: any) => value?.ref?.ref).filter(Boolean);
    }

    return [];
};

/** The StatVars a Spec serves, counted from its resolved membership: the
 *  members door's list once it names any (`listed`), else
 *  `stat_vars.served_count` once membership settled, else the family's
 *  `stat_vars.member_count`, which `member_count_exact` marks as a floor.
 *  Null when the Spec states no membership. Coverage's "variables"
 *  dimension counts the variables with data in the answer's rows, so it
 *  takes no part. */
const servedMembership = (
    spec: any,
    listed?: MemberRef[] | null,
): { count: number; exact: boolean } | null => {
    const statVars = spec?.stat_vars;
    const served: number | null = listed?.length || (statVars?.served_count ?? null);

    if (served != null) return { count: served, exact: true };
    if (statVars?.member_count == null) return null;

    return { count: statVars.member_count, exact: statVars.member_count_exact !== false };
};

/** How many StatVars the answer serves: the settled served count, else the
 *  family's count. */
export const servedSeriesCount = (spec: any): number | null =>
    servedMembership(spec)?.count ?? null;

/** Whether a slot's menu offers anything but what the answer already
 *  serves. A slot bound to one value offers an option it does not bind;
 *  one whose only served option is its current value has nothing to
 *  change. Any other slot spans a union, every option when unbound or its
 *  members when bound to a set, and also offers a pick from that union:
 *  two or more spanned options, or one counted option that serves fewer
 *  rows than `spec` (the answer) downloads. One uncounted option, or one
 *  that serves every row, narrows nothing. */
export const slotOffersChoice = (slot: any, entry: SlotOptionsEntry, spec: any): boolean => {
    const bound = new Set(slotBoundDcids(slot));
    const binds = (option: SlotOption) => bound.has(option.value.ref?.ref ?? '');

    if (bound.size > 0 && !entry.options.every(binds)) return true;
    if (bound.size === 1) return false;

    const spanned = bound.size === 0 ? entry.options : entry.options.filter(binds);
    if (spanned.length > 1) return true;

    const served = spanned[0]?.served_rows;
    const total = spec?.download?.rows;

    return typeof served === 'number' && typeof total === 'number' && served < total;
};

/** True once the engine confirmed no data for an entity option
 *  (optionCoverage's 'probed-zero'): the row stays in its menu but reads
 *  muted rather than vanishing, whether or not it's also the current pick. */
export const optionMuted = (option: OptionLike | null | undefined): boolean =>
    coverageState(option?.coverage) === 'probed-zero';

/**
 * Rank one coverage-annotated entity option list richest-first: observed options
 * first (ties by label), then the currently-bound option even if
 * probed-zero (so a user's own selection never vanishes), then every other
 * probed-zero option demoted to the end of the list — muted (see
 * `optionMuted`) rather than removed. Passes the list through unchanged when
 * nothing in it was ever probed (optionCoverage.partitionOptions' own
 * no-op rule). `boundDcid` is matched via `entityOptionDcid` (pickerState.ts)
 * so this works whether `options` carries the engine's nested SlotOption
 * shape (`value.ref.ref`) or PlaceScopeEditor's flat EntityOption shape
 * (`dcid`).
 */
export const rankOptionsByCoverage = <T extends OptionLike>(
    options: T[],
    boundDcid?: string | null,
): T[] => {
    const { main, hidden } = partitionOptions(options, {
        state: (option) => coverageState(option.coverage),
        richness: (option) => coverageRichness(option.coverage),
        label: (option) => optionLabel(option),
        isPinned: (option) => boundDcid != null && entityOptionDcid(option) === boundDcid,
    });

    return [...main, ...hidden];
};

/** Pulls the matching option out so a caller can render it once, above the
 *  list, instead of duplicated within it. current is null when nothing
 *  matches (an unbound slot, or a value the streamed set doesn't carry),
 *  leaving rest unchanged. Passing a Set instead pulls out every match, for
 *  the multi-select menus, which pin every currently-bound dcid rather than
 *  just one. */
export function splitCurrentPick<T extends OptionLike>(
    options: T[],
    currentDcid: string | null | undefined,
): { current: T | null; rest: T[] };
export function splitCurrentPick<T extends OptionLike>(
    options: T[],
    currentDcids: ReadonlySet<string>,
): { current: T[]; rest: T[] };
export function splitCurrentPick<T extends OptionLike>(
    options: T[],
    pick: string | null | undefined | ReadonlySet<string>,
): { current: T | T[] | null; rest: T[] } {
    if (pick instanceof Set) {
        const current: T[] = [];
        const rest: T[] = [];

        for (const option of options) {
            const dcid = entityOptionDcid(option);

            (dcid != null && pick.has(dcid) ? current : rest).push(option);
        }

        return { current, rest };
    }

    if (pick == null) return { current: null, rest: options };

    const index = options.findIndex((option) => entityOptionDcid(option) === pick);

    if (index === -1) return { current: null, rest: options };

    return {
        current: options[index],
        rest: [...options.slice(0, index), ...options.slice(index + 1)],
    };
}

export type WhyRow = { label: string; value: string; code?: string };

export type WhyVariables = {
    /** the variables the answer serves */
    count: number;
    /** false when count is a floor (stat_vars.member_count_exact) */
    exact: boolean;
    summary: string;
    /** the served members, as the members door lists them */
    members: WhyMembers;
    /** the members counted by each value of an axis they differ on */
    breakdown: WhyBreakdown[];
};

/** The served members as the Why panel lists them: still being read from
 *  the members door, refused or failed, or listed. */
export type WhyMembers =
    | { state: 'loading' }
    | { state: 'failed' }
    | { state: 'listed'; items: { dcid: string; label: string }[] };

/** One open axis the variables differ on ("By instrument"), its values with
 *  the most variables first, and how many values the list leaves out. */
export type WhyBreakdown = {
    title: string;
    values: { label: string; count: number }[];
    more: number;
};

/** The measure the rows name, for readers that need its fields. */
export type WhyMeasure = {
    name: string | null;
    /** the StatVar's dcid, only when the answer serves one variable */
    code: string | null;
    unit: string | null;
    years: string | null;
};

/** One value the answer holds and why: a facet axis ("Source", "Unit") or a
 *  slot a declared default filled, with the reason in words. */
export type WhyChoice = { label: string; value: string; reason: string };

export type WhySummary = {
    measure: WhyMeasure;
    rows: WhyRow[];
    /** how many variables the measure's family holds, when more than the
     *  answer serves ("This answer uses 1 of at least 3 ...") */
    family: string | null;
    /** null for a single variable, which the Measure row names instead */
    variables: WhyVariables | null;
    /** `licence` is set when the answer serves one source, the only case
     *  the API names a licence for */
    sources: {
        ref: string;
        label: string;
        /** the Graph API route of the source's document, null when the
         *  answer names none */
        documentation: string | null;
        origin: string | null;
        licence: string | null;
    }[];
    /** how each facet axis got its value */
    chosen: WhyChoice[];
};

// A time window as the user would say it: "since 2015", "2015 to 2020", "2023".
export const formatWindow = (window: any): string | null => {
    const start = window?.start_year ?? null;
    const end = window?.end_year ?? null;

    if (start == null && end == null) {
        return null;
    }

    if (start != null && end != null) {
        return start === end ? String(start) : `${start} to ${end}`;
    }

    return start != null ? `since ${start}` : `until ${end}`;
};

// The singular noun and row labels for each entity role, and the coverage
// dimension that counts an open role's members.
const ROLE_WORDS: Record<
    EntityRoleKey,
    { noun: string; one: string; many: string; dimension: string }
> = {
    origin: { noun: 'provider', one: 'Provider', many: 'Providers', dimension: 'providers' },
    destination: {
        noun: 'recipient',
        one: 'Recipient',
        many: 'Recipients',
        dimension: 'recipients',
    },
    observationAbout: { noun: 'place', one: 'Place', many: 'Places', dimension: 'places' },
};

const orList = (labels: string[]): string =>
    new Intl.ListFormat('en-GB', { type: 'disjunction' }).format(labels);

// The years a DateRange spans.
const dateRange = (range: any): string | null => {
    const start = range?.start?.slice(0, 4) ?? null;
    const end = range?.end?.slice(0, 4) ?? null;

    if (!start || !end) {
        return null;
    }

    return start === end ? start : `${start} to ${end}`;
};

// Years in order of precedence: the window the query named, the coverage
// window, the span of the served variables' data, then the year a broad
// answer counts.
const yearsText = (spec: any): string | null => {
    const named = formatWindow(spec.resolution?.requested_window);

    if (named) {
        return named;
    }

    const covered = formatWindow(spec.coverage?.window);

    if (covered) {
        return covered;
    }

    const served = dateRange(spec.stat_vars?.data_date_range);

    if (served) {
        return served;
    }

    const year = spec.headline?.year;

    return year != null && !spec.headline?.year_named ? `Latest is ${year}` : null;
};

// Every member of a spec shares its shape, so the shape label holds for all
// of them.
const variablesSummary = (count: number, exact: boolean, shapeLabel?: string | null): string => {
    const counted = exact
        ? `All ${formatCount(count)} variables`
        : `At least ${formatCount(count)} variables`;

    if (!shapeLabel) {
        return `${counted} match.`;
    }

    return exact ? `${counted} are ${shapeLabel}.` : `${counted}, all ${shapeLabel}.`;
};

// The labels of the entities a spec binds to one role.
const entityLabels = (spec: any, role: EntityRoleKey): string[] =>
    (spec.entities ?? [])
        .filter((entity: any) => entity?.role === role)
        .map((entity: any) => entity?.label ?? entity?.ref)
        .filter(Boolean);

// A coverage dimension's count ("recipients", "places"), null when absent.
const dimensionCount = (spec: any, label: string): number | null =>
    (spec?.coverage?.dimensions ?? []).find((dimension: any) => dimension?.label === label)
        ?.count ?? null;

// The scope of a no-place answer. The API narrows one whose full place list
// is too large to the countries with data, and its coverage then counts
// "countries" where a full answer counts "places".
const placeScope = (spec: any): { noun: string; many: string; count: number | null } => {
    const countries = dimensionCount(spec, 'countries');

    return countries != null
        ? { noun: 'country', many: 'Countries', count: countries }
        : { noun: 'place', many: 'Places', count: dimensionCount(spec, 'places') };
};

// The roles a spec leaves open: each role whose options came back with
// nothing bound to it, and the place when no place was named.
const openRoles = (spec: any, codes: Set<string>): EntityRoleKey[] => {
    const bound = new Set((spec.entities ?? []).map((entity: any) => entity?.role));
    const open = (spec.entity_options ?? [])
        .map((entry: any) => entry?.role)
        .filter((role: any): role is EntityRoleKey => role in ROLE_WORDS && !bound.has(role));

    if (codes.has('place_scope_defaulted') && !bound.has('observationAbout')) {
        open.push('observationAbout');
    }

    return open;
};

// The label of the slot `bindingRef` names on `spec` ("Type of flow"),
// null when neither its trace nor its slots carry one.
const slotLabelOf = (spec: any, bindingRef: string): string | null =>
    [...(spec.resolution?.slot_filters ?? []), ...(spec.slots ?? [])].find(
        (entry: any) => entry?.key && keyRef(entry.key) === bindingRef,
    )?.key?.label ?? null;

const lowerFirst = (text: string): string =>
    /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;

// One assumption as the panel states it, in the words of its own `text`.
const assumptionSentence = (spec: any, assumption: Assumption): string => {
    const { kind, binding_ref: ref, text } = assumption;

    if (kind === 'place_scope') return `No place was named, so the answer covers ${text}.`;

    if (kind === 'open_role') {
        // An open role reads "origin:" or "where:", the slot the destination
        // shares with the subject.
        const origin = ref === 'origin:';
        const named = entityLabels(spec, origin ? 'destination' : 'origin');
        const scope = named.length ? ` ${origin ? 'to' : 'from'} ${orList(named)}` : '';

        return `The question left this role open, so the answer covers ${text}${scope}.`;
    }

    const label = slotLabelOf(spec, ref);

    return label
        ? `No ${lowerFirst(label)} was named, so the answer uses ${text}, the default for this measure.`
        : `The question left this open, so the answer uses ${text}, the default for this measure.`;
};

/** What a definite part's answer assumed: one sentence per item of the
 *  part's `assumptions` (a declared default, an open role, the place scope),
 *  in the API's order, then the year. "About this answer" reads this list
 *  (through resultNotes's aboutAnswerNotes). The year sentence keys on
 *  `headline.year_named` as well as `time_window_defaulted`, since a
 *  role-bearing answer can say no year was named without sending that
 *  warning. */
export const scopeAssumptions = (
    spec: any,
    assumptions: readonly Assumption[] | null | undefined,
    warnings?: readonly Pick<Warning, 'code'>[] | null,
): string[] => {
    const sentences = (assumptions ?? []).map((assumption) => assumptionSentence(spec, assumption));
    const yearDefaulted = (warnings ?? []).some(
        (warning) => warning?.code === 'time_window_defaulted',
    );

    if (yearDefaulted || spec.headline?.year_named === false) {
        const year = spec.headline?.year;

        sentences.push(
            year != null && spec.headline?.year_named === false
                ? `No year was named, so the counts are for ${year}, the latest year with data.`
                : 'No year was named, so every year with data is included.',
        );
    }

    return sentences;
};

// The values each axis lists before the rest are counted as "more".
const BREAKDOWN_VALUES = 5;

// The served variables counted by each value of every axis they differ on,
// from open_axis_facts[].values, which the API counts over the distinct
// served members.
const variablesBreakdown = (spec: any): WhyBreakdown[] =>
    (spec.open_axis_facts ?? [])
        .filter((fact: any) => fact?.varies && fact.values?.length > 0)
        .map((fact: any) => ({
            title: `By ${axisLabel(spec, fact.property)}`,
            values: fact.values.slice(0, BREAKDOWN_VALUES).map((entry: any) => ({
                label: capitalise(entry.value?.label ?? entry.value?.ref ?? ''),
                count: entry.count,
            })),
            more: Math.max(fact.values.length - BREAKDOWN_VALUES, 0),
        }));

// "This answer uses 1 of at least 3 variables.", null when
// the answer serves every member stat_vars.member_count counts.
const familyNote = (served: number, statVars: any): string | null => {
    const members = statVars.member_count;

    if (members == null || members <= served) {
        return null;
    }

    const total = `${statVars.member_count_exact === false ? 'at least ' : ''}${formatCount(members)}`;

    return `This answer uses ${formatCount(served)} of ${total} variables.`;
};

const whyMembers = (members: MembersRead | null | undefined): WhyMembers => {
    if (!members) return { state: 'loading' };
    if (!members.ok) return { state: 'failed' };

    return {
        state: 'listed',
        items: members.members.map((member) => ({
            dcid: member.dcid,
            label: member.label ?? member.dcid,
        })),
    };
};

// Why a facet axis holds its value (ResolvedFacet.basis).
const CHOICE_REASONS: Record<FacetBasis, string> = {
    bound: 'Set by your request.',
    declared_default: 'Filled in from the default for this measure.',
    fallback: 'Picked by the search, as the request left it open.',
};

// The facet axes the panel explains, with their row labels.
const FACET_CHOICE_AXES = [
    ['provenance', 'Source'],
    ['measurementMethod', 'Method'],
    ['unit', 'Unit'],
] as const;

const facetChoiceValue = (axis: string, facet: any): string | null => {
    if (facet.selection === 'per_series') {
        return 'Differs by series';
    }

    const raw = facet.label ?? facet.ref ?? null;

    if (!raw) {
        return null;
    }

    return axis === 'measurementMethod' ? formatMethod(facet) : spaceCamel(raw);
};

// How each facet axis got its value (`resolved.facets[axis].basis`). A
// slot a declared default filled is one of the part's `assumptions`, which
// "What we assumed" states (scopeAssumptions).
const whyChoices = (spec: any): WhyChoice[] =>
    FACET_CHOICE_AXES.flatMap(([axis, label]) => {
        const facet = spec.facets?.[axis];
        const reason: string | undefined = facet && CHOICE_REASONS[facet.basis as FacetBasis];
        const value = reason ? facetChoiceValue(axis, facet) : null;

        return reason && value ? [{ label, value, reason }] : [];
    });

// The licence label of the one source the answer serves, in words.
const licenceText = (spec: any): string | null =>
    spec?.download?.licence?.label ? spaceCamel(spec.download.licence.label) : null;

/** The "About this answer" summary for one definite part: what the search
 *  matched (rows), the variables when there is more than one, the sources
 *  with their licence, and how each facet was chosen. The
 *  scope assumptions come from resultNotes's aboutAnswerNotes.
 *
 *  The resolved membership decides the layout (`servedMembership`).
 *  `members` is the members door's answer (`useDefinitionMembers`),
 *  undefined while it is read. Once it lists the served members, one member
 *  names the measure and gives its code, and several fill the Variables
 *  group. Until then, and when the read fails, `stat_vars.served_count`
 *  chooses the layout, and the Measure row carries no code. With membership
 *  unsettled (`served_count` null) and no list, the layout follows
 *  `stat_vars.member_count`: one exact member takes the single-variable
 *  layout, and any other count shows the Variables group, marked as a floor
 *  when `member_count_exact` is false. `member_count` counts the measure's
 *  whole family with data at the place, which can be larger than the served
 *  set (life expectancy in Kenya serves 1 of 3), and feeds the family note.
 *  Coverage's "variables" dimension counts the variables with data in the
 *  answer's rows and chooses nothing here. */
export const buildWhySummary = (
    spec: any,
    part?: Pick<Part, 'warnings' | 'variable_text'> | null,
    members?: MembersRead | null,
): WhySummary => {
    const statVars = spec.stat_vars ?? {};
    const listed = members?.ok ? members.members : null;
    const { count, exact } = servedMembership(spec, listed) ?? { count: 0, exact: true };
    const single = exact && count === 1;
    const member = single && listed?.length === 1 ? listed[0] : null;
    const codes = new Set((part?.warnings ?? []).map((warning) => warning?.code));
    const sources: any[] = spec.resolution?.resolved_sources ?? [];

    const name = member
        ? (member.label ?? member.dcid)
        : (spec.measure_label ?? spec.shape?.label ?? part?.variable_text ?? null);
    const measure: WhyMeasure = {
        name: name ? capitalise(name) : null,
        code: member?.dcid ?? null,
        unit: unitText(spec),
        years: yearsText(spec),
    };
    const rows: WhyRow[] = [];

    if (measure.name) {
        rows.push({
            label: 'Measure',
            value: measure.name,
            ...(measure.code ? { code: measure.code } : {}),
        });
    }

    if (measure.unit) {
        rows.push({ label: 'Unit', value: measure.unit });
    }

    if (measure.years) {
        rows.push({ label: 'Years', value: measure.years });
    }

    const open = openRoles(spec, codes);
    const roleOrder: EntityRoleKey[] = ['observationAbout', 'origin', 'destination'];

    for (const role of roleOrder) {
        const words = ROLE_WORDS[role];
        const labels = entityLabels(spec, role);

        if (labels.length > 0) {
            rows.push({
                label: labels.length === 1 ? words.one : words.many,
                value: labels.join(', '),
            });
        } else if (open.includes(role)) {
            const scope =
                role === 'observationAbout'
                    ? placeScope(spec)
                    : { many: words.many, count: dimensionCount(spec, words.dimension) };

            rows.push({
                label: scope.many,
                value:
                    scope.count != null
                        ? `All ${formatCount(scope.count)} with data`
                        : 'All with data',
            });
        }
    }

    const variables: WhyVariables | null =
        single || count === 0
            ? null
            : {
                  count,
                  exact,
                  summary: variablesSummary(count, exact, spec.shape?.label),
                  members: whyMembers(members),
                  breakdown: variablesBreakdown(spec),
              };

    return {
        measure,
        rows,
        family: count > 0 ? familyNote(count, statVars) : null,
        variables,
        sources: sources.map((ref: any) => ({
            ref: ref.ref,
            label: ref.label ?? ref.ref,
            documentation: ref.documentation ?? null,
            origin: provenanceOrigin(ref),
            licence: sources.length === 1 ? licenceText(spec) : null,
        })),
        chosen: whyChoices(spec),
    };
};

// The headline's role_counts keys, the graph's role property for each flow
// role (dfo-apis search/models/coverage.py Headline).
const HEADLINE_ROLES: [Exclude<EntityRoleKey, 'observationAbout'>, string][] = [
    ['origin', 'financingProvider'],
    ['destination', 'financingRecipient'],
];

const andList = (labels: string[]): string =>
    new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(labels);

const countNoun = (count: number, noun: string, plural = `${noun}s`): string =>
    `${formatCount(count)} ${count === 1 ? noun : plural}`;

// An open role's count in the headline year against its members with data
// in any year: "61 of the 145 recipients that have data".
const roleScope = (count: number, members: number | null, noun: string): string => {
    if (members == null || members < count) {
        return countNoun(count, noun);
    }

    if (members === count) {
        return count === 1
            ? `the one ${noun} that has data`
            : `all ${formatCount(count)} ${noun}s that have data`;
    }

    return `${formatCount(count)} of the ${formatCount(members)} ${noun}s that have data`;
};

/** The sentence under the headline for a role-bearing answer, composed
 *  from `headline` and `coverage.dimensions` so each number names its
 *  scope: the year the counts are for, the values in that year, and each
 *  open role's count against the members with data in any year. A named
 *  provider or recipient closes the sentence. Null without a headline. */
export const coverageSentence = (spec: any): string | null => {
    const headline = spec?.headline;

    if (headline?.year == null || headline.observations == null) {
        return null;
    }

    const open: string[] = [];
    const named: string[] = [];

    for (const [role, property] of HEADLINE_ROLES) {
        const labels = entityLabels(spec, role);
        const count = headline.role_counts?.[property];

        if (labels.length > 0) {
            named.push(`${role === 'origin' ? 'from' : 'to'} ${andList(labels)}`);
        } else if (count != null) {
            const words = ROLE_WORDS[role];
            const scope = roleScope(count, dimensionCount(spec, words.dimension), words.noun);

            open.push(`${role === 'origin' ? 'from' : 'for'} ${scope}`);
        }
    }

    const counted = [countNoun(headline.observations, 'value'), ...open, ...named].join(' ');
    const window = headline.named_window;
    const oneYearNamed =
        headline.year_named &&
        window?.start_year === headline.year &&
        window?.end_year === headline.year;

    if (oneYearNamed) {
        return `${headline.year} has ${counted}.`;
    }

    const latest = headline.year_named
        ? 'the latest year with data in the years asked'
        : 'the latest year with data';

    return `${headline.year} is ${latest}, with ${counted}.`;
};

/** The caption over the preview table for each part whose preview the API
 *  cut to its cap (`observations_series_truncated`), counting the series
 *  the preview holds against the total in the warning's params ("Showing
 *  20 of 927 series") and saying how they were picked: "most recent and
 *  largest first" under the observations' `order` "ranked", "in no
 *  particular order" under "fixed" or from an API that sends no order. The
 *  observations' own `order` describes the rows shown, so it wins over the
 *  warning's `params.order`, which an API that predates the field still
 *  sends. Labelled by variable when the table holds more than one part. */
export const seriesPreviewCaptions = (
    parts: {
        variableText: string | null;
        spec: any;
        warnings?: Pick<Warning, 'code' | 'params'>[];
    }[],
): string[] =>
    parts.flatMap((part) => {
        const shown = part.spec?.observations?.series?.length ?? 0;
        const cut = (part.warnings ?? []).find(
            (warning) => warning?.code === 'observations_series_truncated',
        );

        if (!cut || shown === 0) {
            return [];
        }

        const label = parts.length > 1 && part.variableText ? `${part.variableText}: ` : '';
        const total = cut.params?.total;
        const counted =
            typeof total === 'number' && total > shown
                ? `${formatCount(shown)} of ${countNoun(total, 'series', 'series')}`
                : countNoun(shown, 'series', 'series');

        const order =
            (part.spec?.observations?.order ?? cut.params?.order) === 'ranked'
                ? 'most recent and largest first'
                : 'in no particular order';

        return [`${label}Showing ${counted}, ${order}`];
    });

/** One preview table row. `cells` holds the text of each entity and axis
 *  column the row's part offers, keyed by `PreviewColumn.key`. */
export type ResultRow = {
    year: string;
    cells: Record<string, string>;
    // The party kind of each entity column's value, keyed like `cells`, for
    // the entities the API lists a kind for.
    kinds: Record<string, PartyKind>;
    value: number | null;
    // The series' unit (facet), display-ready — null when the facet has none.
    unit: string | null;
    // The series' measurement method (facet), display-ready. Null when the
    // facet states none.
    method: string | null;
};

/** An entity or axis column of the preview table. */
export type PreviewColumn = { key: string; label: string };

// Units are on the wire as {ref, label} facets (resolved.facets.unit and per
// series facet.unit) — e.g. USDollar / "USDollar". Formatting is ours: a few
// well-known units get their symbol, the rest their label, de-camel-cased.
const UNIT_SYMBOLS: Record<string, string> = {
    USDollar: 'US$',
    Percent: '%',
    Percentage: '%',
};

export const formatUnit = (unit: any): string | null => {
    const ref: string | null = unit?.ref ?? null;
    const label: string | null = unit?.label ?? null;

    if (!ref && !label) {
        return null;
    }

    if (ref && UNIT_SYMBOLS[ref]) {
        return UNIT_SYMBOLS[ref];
    }

    return spaceCamel(label ?? ref ?? '');
};

/** A measurement method's display text: the graph label, else the dcid's
 *  last path segment ("dcAggregate/Census" → "Census"), de-camel-cased and
 *  in sentence case. A label equal to the dcid is the graph's fallback for
 *  an unlabelled node, so it counts as no label. Null when there is no
 *  method. The picker, its trigger and the Method column all read method
 *  text through here; the posted binding keeps the dcid. */
export const formatMethod = (method: any): string | null => {
    const label: string | null = method?.label !== method?.ref ? (method?.label ?? null) : null;
    const raw: string | null = label ?? method?.ref?.split('/').at(-1) ?? null;

    return raw ? capitalise(spaceCamel(raw)) : null;
};

/** The spec-level unit (resolved.facets.unit), when the engine resolved one:
 *  a currency with its price basis as the byline states it ("Constant 2020
 *  US dollars"), any other unit by its symbol or label. */
export const specUnit = (spec: any): string | null =>
    unitWithBasis(spec) ?? formatUnit(spec?.facets?.unit);

// The unit in words ("Constant 2020 US dollars", "Percentage"), as the Why
// panel and the download details name it.
const unitText = (spec: any): string | null => {
    const unit = spec?.facets?.unit;
    const text = unit?.label ?? unit?.ref ?? null;

    return unitWithBasis(spec) ?? (text ? spaceCamel(text) : null);
};

/** Fallback label for a constraint property with no shape-declared slot.
 *  De-camel-cases and drops a leading "crs" prefix, which reads as noise
 *  next to the human labels that existing CRS slots carry. */
export const openAxisFactLabel = (property: string): string => {
    const stripped = property.startsWith('crs') ? property.slice(3) : property;

    return stripped.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
};

/** A constraint property's name for a reader: its slot's label
 *  ("instrument"), else `openAxisFactLabel`. */
export const axisLabel = (spec: any, property: string): string =>
    (spec?.slots ?? []).find((slot: any) => slot?.key?.property?.ref === property)?.key?.label ??
    openAxisFactLabel(property);

// The cell of a row whose part has no such column.
const NO_CELL = '—';

// Entity columns lead in this order, then the axis columns.
const ROLE_ORDER: string[] = ['origin', 'destination', 'observationAbout'];

const entityKey = (role: string): string => `entity:${role}`;
const axisKey = (property: string): string => `axis:${property}`;

const slotOnAxis = (spec: any, axis: string): any =>
    (spec?.slots ?? []).find((slot: any) => slot?.key?.axis === axis);

const slotOnProperty = (spec: any, property: string): any =>
    (spec?.slots ?? []).find((slot: any) => slot?.key?.property?.ref === property);

// The one value ref a slot binds, null for an unbound slot or a set.
const boundRef = (slot: any): string | null =>
    slot?.binding?.kind === 'value' ? (slot.binding.value?.ref?.ref ?? null) : null;

// Provider and Recipient head their role's column. A single-role series'
// entity takes the where slot's own label ("Place").
const roleHeading = (spec: any, role: string): string =>
    role === 'origin' || role === 'destination'
        ? ROLE_WORDS[role].one
        : capitalise(slotOnAxis(spec, 'where')?.key?.label ?? ROLE_WORDS.observationAbout.one);

// A column one part offers. `bound` is the one ref the part's Spec binds it
// to, so rows that all carry that ref restate the sentence. `named` says
// the heading came from the Spec's own slot.
type PartColumn = PreviewColumn & { bound: string | null; named: boolean };

// Whether some series carries `ObservationSeries.axes`. A table from an API
// that predates the field, or from a share saved before it, has none.
const carriesAxes = (spec: any): boolean =>
    (spec?.observations?.series ?? []).some((s: any) => Array.isArray(s?.axes));

// A series' subject entity for a table without axes: the observationAbout
// entry of its role tuple, else its first entity.
const seriesEntity = (s: any): { role: string; label: string | null } => {
    const about =
        (s?.entities ?? []).find((e: any) => e?.role === 'observationAbout') ?? s?.entities?.[0];

    return { role: about?.role ?? 'observationAbout', label: about?.label ?? null };
};

// A slot's bound value labels, the text a table without axes shows in its
// how and what columns.
const slotLabel = (spec: any, axis: string): string => {
    const binding = slotOnAxis(spec, axis)?.binding;

    if (binding?.kind === 'value') {
        return binding.value?.ref?.label ?? NO_CELL;
    }

    if (binding?.kind === 'set') {
        const labels = (binding.values ?? []).map((v: any) => v?.ref?.label).filter(Boolean);

        return labels.length ? labels.join(', ') : NO_CELL;
    }

    return NO_CELL;
};

const LEGACY_SLOT_HEADINGS: Record<string, string> = { how: 'Sector', what: 'Type' };

// The cells of one series' rows: one per entity role and one per axis
// property, or, without axes, the subject entity and the how and what
// slots' bound values.
const seriesCells = (s: ObservationSeries, spec: any, axes: boolean): Record<string, string> => {
    if (!axes) {
        const subject = seriesEntity(s);

        return {
            [entityKey(subject.role)]: subject.label ?? NO_CELL,
            'slot:how': slotLabel(spec, 'how'),
            'slot:what': slotLabel(spec, 'what'),
        };
    }

    const cells: Record<string, string> = {};

    for (const entity of s?.entities ?? []) {
        cells[entityKey(entity.role)] = entity.label ?? entity.ref;
    }

    for (const axis of s?.axes ?? []) {
        cells[axisKey(axis.property)] = capitalise(axis.label);
    }

    return cells;
};

// A series' refs per column: its entities' dcids by role and its axis
// values by property.
const seriesRefs = (s: any): Record<string, string> => {
    const refs: Record<string, string> = {};

    for (const entity of s?.entities ?? []) {
        refs[entityKey(entity.role)] = entity.ref;
    }

    for (const axis of s?.axes ?? []) {
        refs[axisKey(axis.property)] = axis.ref;
    }

    return refs;
};

// The columns one part offers: entities in role order, then its axes in
// the Spec's slot order and by property dcid after that. Without axes, the
// subject entity and the how and what slots, none of them hidden for a
// shared value.
const partColumns = (spec: any): PartColumn[] => {
    const series: any[] = spec?.observations?.series ?? [];

    if (!carriesAxes(spec)) {
        const roles = [...new Set(series.map((s) => seriesEntity(s).role))];

        return [
            ...roles.map((role) => ({
                key: entityKey(role),
                label: roleHeading(spec, role),
                bound: null,
                named: true,
            })),
            ...Object.entries(LEGACY_SLOT_HEADINGS).map(([axis, fallback]) => {
                const label: string | undefined = slotOnAxis(spec, axis)?.key?.label;

                return {
                    key: `slot:${axis}`,
                    label: label ? capitalise(label) : fallback,
                    bound: null,
                    named: Boolean(label),
                };
            }),
        ];
    }

    const roles = [
        ...new Set<string>(series.flatMap((s) => (s?.entities ?? []).map((e: any) => e.role))),
    ].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
    // A role the Spec names one entity for binds that entity.
    const namedRef = (role: string): string | null => {
        const refs = (spec?.entities ?? []).filter((e: any) => e?.role === role);

        return refs.length === 1 ? (refs[0].ref ?? null) : null;
    };
    const slotIndex = (property: string): number => {
        const index = (spec?.slots ?? []).findIndex(
            (slot: any) => slot?.key?.property?.ref === property,
        );

        return index === -1 ? Infinity : index;
    };
    const properties = [
        ...new Set<string>(series.flatMap((s) => (s?.axes ?? []).map((a: any) => a.property))),
    ].sort((a, b) => slotIndex(a) - slotIndex(b) || (a < b ? -1 : a > b ? 1 : 0));

    return [
        ...roles.map((role) => ({
            key: entityKey(role),
            label: roleHeading(spec, role),
            bound: namedRef(role),
            named: true,
        })),
        ...properties.map((property) => {
            const slot = slotOnProperty(spec, property);

            return {
                key: axisKey(property),
                label: capitalise(axisLabel(spec, property)),
                bound: boundRef(slot),
                named: Boolean(slot),
            };
        }),
    ];
};

/**
 * The preview table's entity and axis columns over every part, in the
 * order the table shows them: entity roles (Provider, Recipient, the
 * place), then axis properties in each part's slot order, a later part's
 * new properties after the earlier ones. A column is headed from the first
 * part whose Spec has a slot for it. A part restates a column when its Spec
 * binds it to exactly one value (a slot bound to one value, or the one
 * entity it names for that role) and every row of the part carries that
 * value's ref, since the part's sentence states that value. Rows that all
 * show a child of a bound parent code, or one member of a bound set, keep
 * the column. The column is hidden when every part that offers it restates
 * the same ref. Two parts bound to different values keep it, so their rows
 * stay distinguishable, and a constant unbound axis still shows. A column
 * with no text on any row is hidden too.
 */
export const previewColumns = (parts: { spec: any }[]): PreviewColumn[] => {
    // Per column, the ref every part that offers it restates (null once one
    // does not, or two disagree) and whether any row has text for it.
    const offered = new Map<string, PartColumn & { restated: string | null; filled: boolean }>();

    for (const { spec } of parts) {
        const rows = flattenRows(spec);

        if (rows.length === 0) {
            continue;
        }

        // The series behind the rows, those with points.
        const refs: Record<string, string>[] = (spec?.observations?.series ?? [])
            .filter((s: any) => (s?.points ?? []).length > 0)
            .map(seriesRefs);

        for (const column of partColumns(spec)) {
            const texts = new Set(rows.map((row) => previewCellText(row, column.key)));
            const restated =
                column.bound != null && refs.every((r) => r[column.key] === column.bound)
                    ? column.bound
                    : null;
            const seen = offered.get(column.key);
            const heading = !seen || (!seen.named && column.named) ? column : seen;

            offered.set(column.key, {
                ...heading,
                restated: seen && seen.restated !== restated ? null : restated,
                filled: Boolean(seen?.filled) || [...texts].some((text) => text !== NO_CELL),
            });
        }
    }

    const rank = (key: string): number => {
        const role = key.startsWith('entity:') ? ROLE_ORDER.indexOf(key.slice(7)) : -1;

        return role === -1 ? ROLE_ORDER.length : role;
    };

    return [...offered.values()]
        .sort((a, b) => rank(a.key) - rank(b.key))
        .filter((column) => column.filled && column.restated == null)
        .map(({ key, label }) => ({ key, label }));
};

// A series' party kind per entity column.
const seriesKinds = (s: ObservationSeries): Record<string, PartyKind> => {
    const kinds: Record<string, PartyKind> = {};

    for (const entity of s?.entities ?? []) {
        if (entity?.party_kind) {
            kinds[entityKey(entity.role)] = entity.party_kind;
        }
    }

    return kinds;
};

/**
 * The entity columns whose total rows the table marks are those that hold two
 * or more parties (a residual counts as one, since the server keeps it with
 * the parties and a sum down the column still includes it) and at least one
 * total, across the rows of every part. A total beside a single party is
 * summed with nothing, so it stays unmarked.
 */
export const markedTotalColumns = (parts: { spec: any }[]): ReadonlySet<string> => {
    const parties = new Map<string, Set<string>>();
    const totals = new Set<string>();

    for (const { spec } of parts) {
        for (const s of spec?.observations?.series ?? []) {
            if ((s?.points ?? []).length === 0) {
                continue;
            }

            for (const entity of s?.entities ?? []) {
                const key = entityKey(entity.role);

                if (entity?.party_kind === 'total') {
                    totals.add(key);
                } else if (entity?.party_kind === 'party' || entity?.party_kind === 'residual') {
                    parties.set(key, (parties.get(key) ?? new Set()).add(entity.ref));
                }
            }
        }
    }

    return new Set([...totals].filter((key) => (parties.get(key)?.size ?? 0) >= 2));
};

export const TOTAL_ROW_MARK = 'total';

/** A row's text in an entity or axis column, "—" where its part has none.
 *  In a column from `markedTotalColumns`, a total's text carries
 *  `TOTAL_ROW_MARK`. */
export const previewCellText = (
    row: ResultRow,
    key: string,
    marked?: ReadonlySet<string>,
): string => {
    const text = row.cells[key] ?? NO_CELL;

    return text !== NO_CELL && marked?.has(key) && row.kinds[key] === 'total'
        ? `${text} (${TOTAL_ROW_MARK})`
        : text;
};

// The unit a series' own points carry. The series facet names the currency
// alone, so the price basis joins it only on a converted series (its
// `conversion` record), where the Spec's identity states the basis the
// values were converted to. A preview that could not apply the conversion
// keeps the unit the points are in.
const seriesUnit = (series: ObservationSeries, spec: any): string | null =>
    (series?.conversion ? unitWithBasis(spec) : null) ??
    formatUnit(series?.facet?.unit) ??
    formatUnit(spec?.facets?.unit);

/** The observation series a Spec carries; none before its observations
 *  arrive. */
export const observationSeries = (
    spec: Pick<Spec, 'observations'> | null | undefined,
): ObservationSeries[] => spec?.observations?.series ?? [];

export const flattenRows = (spec: any): ResultRow[] => {
    const axes = carriesAxes(spec);

    const rows: ResultRow[] = observationSeries(spec).flatMap((s) => {
        const cells = seriesCells(s, spec, axes);
        const kinds = seriesKinds(s);

        return s.points.map((point) => ({
            year: point.date,
            cells,
            kinds,
            value: point.value,
            unit: seriesUnit(s, spec),
            method: formatMethod(s.facet?.measurementMethod),
        }));
    });

    return rows.sort((a, b) => (a.year < b.year ? 1 : a.year > b.year ? -1 : 0));
};

/** One row of the measurement-method picker. */
export type MethodChoice = {
    key: string;
    label: string;
    checked: boolean;
    /** The facet binding a pick posts. Null drops the axis. */
    binding: IdentityFacetBinding['measurementMethod'] | null;
};

export type MethodPicker = { label: string; choices: MethodChoice[] };

export const ANY_METHOD_LABEL = 'Any method';
export const NO_METHOD_LABEL = 'No stated method';

/** A Method column cell: the row's method, else `NO_METHOD_LABEL`. The
 *  column shows only when some row states a method, so a row without one
 *  says so beside them. */
export const methodCellText = (row: ResultRow): string => row.method ?? NO_METHOD_LABEL;

/**
 * The method behind the table's rows while the axis is unbound: `ref` when
 * every series with points shares one stated method, null when none of
 * them states one, absent for mixed methods or before series arrive
 * without a resolved one. It reads the series facets `flattenRows` fills
 * the Method column from, so the picker and the table agree, including on
 * a snapshot whose captured rows replace the replay's observations.
 * `resolved.facets.measurementMethod` stands in until series arrive.
 */
const servedMethod = (spec: any): { ref?: string | null; label: string } => {
    const shown = (spec?.observations?.series ?? []).filter(
        (series: any) => (series?.points ?? []).length > 0,
    );

    if (shown.length > 0) {
        const refs = new Set<string | null>(
            shown.map((series: any) => series?.facet?.measurementMethod?.ref ?? null),
        );

        if (refs.size > 1) {
            return { label: 'Mixed methods' };
        }

        const method = shown[0]?.facet?.measurementMethod;

        return method?.ref
            ? { ref: method.ref, label: formatMethod(method) ?? method.ref }
            : { ref: null, label: NO_METHOD_LABEL };
    }

    const served = spec?.facets?.measurementMethod;

    if (served?.ref) {
        return { ref: served.ref, label: formatMethod(served) ?? served.ref };
    }

    return { label: served?.selection === 'per_series' ? 'Mixed methods' : ANY_METHOD_LABEL };
};

/** A bound method choice's key: the ref, else `NO_METHOD_LABEL` for the
 *  facets that state no method. A dcid holds no spaces, so the label cannot
 *  collide with one. */
const methodRefKey = (ref: string | null): string => ref ?? NO_METHOD_LABEL;

/**
 * The measurement-method picker for one definite spec, built from the
 * `measurementMethod` facet options the same way the source picker reads
 * the `provenance` ones. The first choice drops the binding and lets the
 * engine choose again; the rest bind one observed method. The option with
 * no ref, offered beside a declared method, binds `ref: null`: the facets
 * that state no method, read as "No stated method". Null when there is
 * nothing to switch to: no method options, or an unbound axis already
 * serving the only option on offer.
 *
 * The trigger label names the bound method, else the one the table's
 * series were read from (`servedMethod`).
 */
export const methodPicker = (spec: any): MethodPicker | null => {
    const options = facetAxisOptions(spec, 'measurementMethod');

    if (options.length === 0) {
        return null;
    }

    const bound: IdentityFacetBinding['measurementMethod'] =
        spec?.identity?.facets?.measurementMethod;
    const boundRefs: (string | null)[] =
        bound?.state === 'set' ? bound.refs : bound && 'ref' in bound ? [bound.ref] : [];
    const served = servedMethod(spec);
    const optionRef = (option: SlotOption): string | null => option.value.ref?.ref ?? null;

    if (boundRefs.length === 0 && options.length === 1 && served.ref === optionRef(options[0])) {
        return null;
    }

    const optionLabelFor = (ref: string | null): string =>
        ref === null
            ? NO_METHOD_LABEL
            : (formatMethod(options.find((option) => optionRef(option) === ref)?.value.ref) ??
              formatMethod({ ref }) ??
              ref);

    const label = boundRefs.length ? boundRefs.map(optionLabelFor).join(', ') : served.label;

    return {
        label,
        choices: [
            { key: '', label: ANY_METHOD_LABEL, checked: boundRefs.length === 0, binding: null },
            ...options.map((option) => {
                const ref = optionRef(option);

                return {
                    key: methodRefKey(ref),
                    label: optionLabelFor(ref),
                    checked: boundRefs.includes(ref),
                    binding: { state: 'value' as const, ref },
                };
            }),
        ],
    };
};

/** Whether a spec binds a method: the parts a shared method token speaks
 *  for, so the parts its menu reads and its pick applies to. */
export const bindsMethod = (spec: any): boolean =>
    Boolean(spec?.identity?.facets?.measurementMethod);

/** The choice key for a method binding: '' for Any method, else
 *  `methodRefKey` of its ref. Null for a binding no single choice posts. */
const methodChoiceKey = (binding: MethodChoice['binding']): string | null => {
    if (binding == null) return '';

    return 'ref' in binding ? methodRefKey(binding.ref) : null;
};

/**
 * The method picker a shared method token offers over `specs`, the parts it
 * covers (`bindsMethod`): the first part's picker, keeping the choices every
 * part offers. Any method is always kept; a part with no picker offers only
 * it. Null when no part has a picker.
 */
export const sharedMethodPicker = (specs: any[]): MethodPicker | null => {
    const pickers = specs.map(methodPicker);
    const first = pickers.find((picker) => picker !== null);

    if (!first) return null;

    const offered = (key: string, picker: MethodPicker | null): boolean =>
        key === '' || (picker?.choices.some((choice) => choice.key === key) ?? false);

    return {
        ...first,
        choices: first.choices.filter((choice) =>
            pickers.every((picker) => offered(choice.key, picker)),
        ),
    };
};

/** Whether every part in `specs` offers `binding`: the shared method menu
 *  lists it (`sharedMethodPicker`). */
export const sharedMethodServes = (specs: any[], binding: MethodChoice['binding']): boolean => {
    const key = methodChoiceKey(binding);

    return (
        key !== null &&
        (sharedMethodPicker(specs)?.choices.some((choice) => choice.key === key) ?? false)
    );
};

/** One preview table's row, tagged with the variable (part) it belongs to. */
export type PartResultRow = ResultRow & { variable: string };

// Fixed text for every reason that needs no counts of its own.
// observations_no_points and observations_preview_too_large are handled
// separately in observationsOmissionText, since their wording needs the
// coverage/pair counts to stay accurate.
const OBSERVATIONS_OMISSION_TEXT: Record<
    Exclude<
        ObservationsOmissionReason,
        'observations_no_points' | 'observations_preview_too_large'
    >,
    string
> = {
    observations_timed_out:
        'The preview ran out of time before it could fetch this selection. Try again.',
    observations_no_matching_source:
        'No published source carries these observations in a form the preview can read.',
    observations_windowed_scope_unsupported:
        "The preview can't fetch this selection's date range yet.",
    observations_converted_scope_unsupported:
        "The preview can't fetch this selection's unit conversion yet.",
    observations_no_dispatchable_facet:
        'No fetchable source, method, or unit combination was found for this selection.',
    observations_bulk_fetch_failed:
        'The preview fetch failed while retrieving these series together. Try again.',
    observations_probe_failed: 'The preview fetch failed for this selection. Try again.',
    observations_nothing_to_probe: 'There is nothing for the preview to fetch in this selection.',
    observations_clients_unavailable: 'The preview service is temporarily unavailable. Try again.',
};

const KNOWN_OMISSION_REASONS = new Set<string>([
    ...Object.keys(OBSERVATIONS_OMISSION_TEXT),
    'observations_no_points',
    'observations_preview_too_large',
]);

/** The line shown while a preview's observations are still streaming in,
 *  the pending sibling of the omission copy below, read from the same module
 *  by every surface that renders either (see
 *  `DataSearch`/`SearchTable`). */
export const observationsPendingText = 'Preparing results preview…';

/** The omission reason plus whatever counts came with it, resolved across
 *  every part in display order. Reads `spec.observations.omitted` first,
 *  the engine's own typed reason for withholding the preview, then falls
 *  back to a part's warning codes for an engine that hasn't shipped
 *  `omitted` yet (the same vocabulary either way, since reason equals
 *  warning code by contract). `reason: null` means neither source explains
 *  the omission. Read it as a gap in what the client can say, not as
 *  evidence the slice is empty. */
export interface ObservationsOmissionInfo {
    reason: ObservationsOmissionReason | null;
    pairs?: number | null;
    cap?: number | null;
}

export const resolveObservationsOmission = (
    parts: {
        spec?: { observations?: { omitted?: ObservationsOmission | null } | null } | null;
        warnings?: { code?: string; message?: string }[];
    }[],
): ObservationsOmissionInfo => {
    for (const part of parts) {
        const omitted = part.spec?.observations?.omitted;

        if (omitted?.reason) {
            return { reason: omitted.reason, pairs: omitted.pairs, cap: omitted.cap };
        }
    }

    for (const part of parts) {
        const warning = (part.warnings ?? []).find(
            (w) => w?.code && KNOWN_OMISSION_REASONS.has(w.code),
        );

        if (warning?.code) {
            return { reason: warning.code as ObservationsOmissionReason };
        }
    }

    return { reason: null };
};

/**
 * The empty-preview message for a resolved omission. `observationCount` is
 * the same coverage-derived total the header shows (independent of the
 * preview fetch), so `observations_no_points` can echo what the header
 * already knows. An unrecognised or absent reason renders a generic
 * "preview unavailable" message, never an assertion that the slice itself
 * is empty. An unknown reason cannot support that claim.
 */
export const observationsOmissionText = (
    info: ObservationsOmissionInfo,
    observationCount: number,
): string => {
    if (info.reason === 'observations_no_points') {
        return observationCount > 0
            ? `${formatCount(observationCount)} observations are recorded for this selection, but none came back in the preview.`
            : 'The preview fetched this selection and found no observations.';
    }

    if (info.reason === 'observations_preview_too_large') {
        const scale =
            info.pairs != null && info.cap != null
                ? ` This selection has ${formatCount(info.pairs)} series, above the ${formatCount(info.cap)} the preview fetches.`
                : ' This selection is larger than the preview fetches.';

        return `The preview was withheld.${scale} The full data is available from the download button.`;
    }

    if (info.reason && info.reason in OBSERVATIONS_OMISSION_TEXT) {
        return OBSERVATIONS_OMISSION_TEXT[info.reason as keyof typeof OBSERVATIONS_OMISSION_TEXT];
    }

    return 'The preview is unavailable for this selection right now. Try again, or use the download button for the full data.';
};

/**
 * The multi-part table's row union: each definite part's own rows
 * (unchanged, still sorted within the part), tagged with that part's own
 * what-phrase for the leading Variable column. Part order first, each
 * part's existing sort within it — nothing is re-sorted across parts.
 */
export const flattenPartsRows = (
    parts: { variableText: string | null; spec: any }[],
): PartResultRow[] =>
    parts.flatMap(({ variableText, spec }) =>
        flattenRows(spec).map((row) => ({
            ...row,
            variable: variableText ?? spec?.shape?.label ?? '—',
        })),
    );

// A part's own outcome, in plain language, for its variable line and for a
// marked unresolved phrase's hover title. Both surfaces read this one map,
// so they say the same thing for the same reason code.
const NO_DATA_REASON_TEXT: Record<Known<NoDataReason>, string> = {
    source_not_resolved: "We couldn't match the data source named in that query.",
    source_ambiguous: 'More than one data source matches that wording. Try naming it in full.',
    source_code_not_held: 'No source we search publishes that code for this question.',
    source_code_ambiguous:
        'More than one of the sources named publishes that code. Name the one you mean.',
    source_code_shares_variable:
        "That code's series also answer other codes of its source, so it can't be shown alone.",
    entity_not_resolved: "We couldn't match the place in that query.",
    entity_ambiguous: 'More than one place matches that wording. Try being more specific.',
    entity_set_too_large: 'That place has too many members for us to check them all at once.',
    entity_role_not_admitted: "That place isn't a kind of place this data is reported for.",
    variable_not_resolved: "We couldn't match the measure in that query.",
    role_not_resolved:
        'We couldn\'t tell whether that place is the aid provider or recipient. Try rephrasing with "to" or "from".',
    unit_not_resolved: "We couldn't read the requested unit in that query.",
    rate_coverage_gap: "We couldn't calculate that rate for the requested period.",
    no_matching_slice: 'That specific combination is unavailable as a data series.',
    binding_mismatch: 'No published series carries every condition in that query.',
    denominator_not_available: 'The matching series is not in the form that query asks for.',
    no_observations: 'This region has no observations.',
    facet_not_available: 'Data exists, but not from the requested source, method, or unit.',
    role_incompatible: 'The matched series is not published as a flow to or from that place.',
    role_signature_incompatible:
        'The matching series disagree about who gives and receives, so no single answer fits.',
    qualifier_not_bound:
        'A category or condition in that query could not be applied to the matching series.',
};

export const noDataReasonText = (reason?: NoDataReason | null): string =>
    reason && hasKey(NO_DATA_REASON_TEXT, reason)
        ? NO_DATA_REASON_TEXT[reason]
        : 'No data matched this query.';

// Names the failed gate for every reason pairing a flagged_match with one.
// The flagged_match of role_incompatible, qualifier_not_bound and
// denominator_not_available carries no gate since no availability verdict
// was taken.
const NO_DATA_GATE_TEXT: Record<Known<NoDataGate>, string> = {
    no_member_has_data_at_place: 'That match has no data at this place.',
    no_member_asserts_bound_properties: "That match doesn't carry the condition this query needs.",
    only_alternate_has_data: 'Only a different variable has data for this request.',
};

// An entity refusal carries the wordings it is about (`entity_terms`), so
// the message can name them instead of leaving the user to work out which
// word failed. The engine's contract forbids parsing the sentence for this.
const quoted = (terms: string[]): string => terms.map((term) => `“${term}”`).join(' and ');

/** One unit alternative as a phrase in the "Did you mean" sentence. An ISO code keeps its
 *  display name; a role shape carries only the role's noun ("recipient"), so it reads as
 *  that entity's currency. */
const unitAlternativeText = ({ currency, label }: UnitAlternative): string =>
    typeof currency === 'string' ? label : `the ${label}'s currency`;

/** The denominators a denominator_not_available refusal compared, as the
 *  sentence after its reason. Null when it names neither. */
const denominatorText = ({ asked, found }: NoDataDenominator): string | null => {
    if (asked && found) {
        return `The closest series divides by ${found.label}. The query asks to divide by ${asked.label}.`;
    }
    if (asked) {
        return `The closest series states no base. The query asks to divide by ${asked.label}.`;
    }
    if (found) {
        return `The closest series divides by ${found.label}.`;
    }
    return null;
};

/** A no_data outcome in plain language, naming the entities it is about
 *  when the refusal carries them. */
export const noDataText = (
    noData?: Pick<
        NoData,
        | 'reason'
        | 'entity_terms'
        | 'unbound_qualifiers'
        | 'gate'
        | 'unit_alternatives'
        | 'denominator'
    > | null,
): string => {
    const base = noDataReasonText(noData?.reason);
    const terms = noData?.entity_terms ?? [];

    if (noData?.reason === 'unit_not_resolved' && noData.unit_alternatives?.length) {
        const labels = noData.unit_alternatives.map(unitAlternativeText);
        const choices = new Intl.ListFormat('en-US', { type: 'disjunction' }).format(labels);
        return `${base} Did you mean ${choices}?`;
    }

    if (noData?.reason === 'qualifier_not_bound') {
        const qualifiers = noData.unbound_qualifiers?.map((qualifier) => qualifier.text) ?? [];
        const noVocabulary = (noData.unbound_qualifiers ?? [])
            .filter((qualifier) => qualifier.disposition === 'no_vocabulary')
            .map((qualifier) => qualifier.text);

        if (noVocabulary.length > 0) {
            const distinction = noVocabulary.length === 1 ? 'distinction' : 'distinctions';
            const retry = noVocabulary.length === 1 ? 'it' : 'them';
            return `This data does not record the ${distinction} ${quoted(noVocabulary)}. Try again without ${retry}.`;
        }

        return qualifiers.length > 0
            ? `We couldn't apply ${quoted(qualifiers)} to this query.`
            : base;
    }

    if (noData?.reason === 'denominator_not_available' && noData.denominator) {
        const compared = denominatorText(noData.denominator);
        if (compared) return `${base} ${compared}`;
    }

    if (noData?.gate && hasKey(NO_DATA_GATE_TEXT, noData.gate)) {
        return `${base} ${NO_DATA_GATE_TEXT[noData.gate]}`;
    }

    if (terms.length === 0) {
        return base;
    }

    if (noData?.reason === 'entity_not_resolved') {
        return `We couldn't match ${quoted(terms)} to a place we hold.`;
    }

    return `${base} (${quoted(terms)})`;
};

/** flagged names the failed gate on a same-variable, same-place match;
 *  alternate names a categorically different, data-bearing variable; studio
 *  hands off when nothing close enough exists. Null when nearest_real is
 *  non-empty, which keeps its own cards branch instead. */
export type NoDataCallout =
    | { kind: 'flagged'; spec: any; text: string | undefined; editText: string | undefined }
    | { kind: 'alternate'; spec: any; text: string | undefined; pickText: string | undefined }
    | { kind: 'studio' };

export const noDataCallout = (part: any, question?: string | null): NoDataCallout | null => {
    const nearest = part?.no_data?.nearest_real ?? [];

    if (nearest.length > 0) {
        return null;
    }

    const flaggedMatch = part?.no_data?.flagged_match;

    if (flaggedMatch) {
        return {
            kind: 'flagged',
            spec: flaggedMatch,
            text: cardText(flaggedMatch, part?.variable_text),
            editText: cardText(flaggedMatch, question),
        };
    }

    const alternateMatch = part?.no_data?.alternate_match;

    if (alternateMatch) {
        const text = cardText(alternateMatch, primaryStatVarLabel(alternateMatch));

        return { kind: 'alternate', spec: alternateMatch, text, pickText: text };
    }

    return { kind: 'studio' };
};

/** A part's own status, in plain language, for a candidates/no_data/
 *  unsupported part — null for a definite (resolved) part. */
export const unresolvedPartText = (part: any): string | null => {
    if (part?.status === 'candidates') {
        return 'Needs a choice';
    }

    if (part?.status === 'no_data') {
        return noDataText(part.no_data);
    }

    if (part?.status === 'unsupported') {
        return part.unsupported?.detail ?? 'This query isn’t supported yet.';
    }

    return null;
};

/** What an ambiguous wording names, by the role its restatement entity
 *  plays. The engine echoes a directed role as "from" or "to" (dfo-apis
 *  search/engine/role_text.py), so "from" is a provider, "to" a recipient, and
 *  anything else a place. */
const ambiguousEntityNoun = (restatement: ParsedPart | null | undefined, text: string): string => {
    const role = restatement?.entities
        ?.find((entity) => entity.text === text)
        ?.role_text?.toLowerCase();

    return role === 'from' ? 'Provider' : role === 'to' ? 'Recipient' : 'Place';
};

/**
 * The title over an entity_ambiguous part's menu, naming what each of its
 * ambiguous wordings is: "Select Recipient" for "ODA to Congo", "Select
 * Provider or Recipient" when the provider and the recipient are both ambiguous.
 */
export const ambiguousEntityMenuTitle = (
    part: { no_data?: NoData | null; restatement?: ParsedPart | null } | null | undefined,
): string => {
    const groups = entityChoiceGroups(part?.no_data);

    if (groups.length === 0) {
        return 'Select Place';
    }

    const nouns = new Set(
        groups.map((group) => ambiguousEntityNoun(part?.restatement, group.text)),
    );

    return `Select ${[...nouns].join(' or ')}`;
};

/**
 * The ambiguous wording an entity_ambiguous part's slot token renders, with
 * the options that settle it (entityChoiceGroups), or null for any other
 * token. The engine marks each wording as a `slot` token with no
 * `entity_refs` or `binding_ref`, the role the request gave it, and text
 * equal to the wording (dfo-apis search/render/no_data.py). The part's own
 * variable slot is never one.
 */
export const ambiguousWordingGroup = (
    token: SentenceToken,
    noData: NoData | null | undefined,
): EntityChoiceGroup | null => {
    if (
        token.kind !== 'slot' ||
        token.axis === 'what' ||
        token.binding_ref ||
        token.entity_refs?.length
    ) {
        return null;
    }

    return entityChoiceGroups(noData).find((group) => group.text === token.text) ?? null;
};

// Values render exactly as the engine sent them — US-style separators,
// capped decimals; the unit (when a facet carries one) is shown alongside,
// never multiplied or converted.
const number = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
});

export const formatValue = (value: number | null): string =>
    value == null ? '—' : number.format(value);

export const formatCount = (value: number | null | undefined): string =>
    value == null ? '—' : new Intl.NumberFormat('en-US').format(value);

// Best-available observation count: exact coverage carries observation_count,
// breadth/bare coverage only carries dimensions (an 'observations' entry when
// the engine could count them).
export const observationCount = (spec: any): number | null => {
    const direct = spec?.coverage?.observation_count ?? spec?.observations?.total_obs;

    if (direct != null) {
        return direct;
    }

    const dims = spec?.coverage?.dimensions ?? [];

    return dims.find((d: any) => d?.label === 'observations')?.count ?? null;
};

// Card meta line: observations when countable, otherwise the widest dimension
// the engine reported ("36 donors"), otherwise a plain has-data note.
export const coverageSummary = (spec: any): string => {
    const count = observationCount(spec);

    if (count != null) {
        return `${formatCount(count)} observations`;
    }

    const first = (spec?.coverage?.dimensions ?? [])[0];

    if (first?.count != null && first?.label) {
        return `${formatCount(first.count)} ${first.label}`;
    }

    return spec?.coverage?.has_data ? 'Has data' : 'No data';
};

/** The right panel's big number: the rows the spec's series serve
 *  (`resolved.download.rows`), total rows included, so it can exceed the
 *  main table of a long CSV or Excel download, which sets totals apart.
 *  `upTo` when the count is an upper bound. Null when the API could not count them without
 *  understating, or sent no download facts (a merged answer). */
export const downloadRowCount = (spec: any): { rows: number; upTo: boolean } | null => {
    const download = spec?.download;

    return download?.rows != null
        ? { rows: download.rows, upTo: download.rows_exact === false }
        : null;
};

const fileSize = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const SIZE_UNITS = ['bytes', 'KB', 'MB', 'GB'];

/** A file size in decimal units: "512 bytes", "2.4 KB", "48.2 MB". */
export const formatBytes = (bytes: number): string => {
    let value = bytes;
    let unit = 0;

    while (value >= 1000 && unit < SIZE_UNITS.length - 1) {
        value /= 1000;
        unit += 1;
    }

    return `${fileSize.format(value)} ${SIZE_UNITS[unit]}`;
};

/** The Details list's years. When the row count is an upper bound
 *  (`rows_exact` false, a conversion that drops the rows a rate table
 *  lacks), the years are one too, so a closed range reads "within 1973 to
 *  2024" and an open one, which cannot say that, is left out. */
const detailYears = (download: any): string | null => {
    const years = formatWindow(download?.window);

    if (!years || download.rows_exact !== false) {
        return years;
    }

    return download.window.start_year != null && download.window.end_year != null
        ? `within ${years}`
        : null;
};

/** One row of the panel's Details list. `source` names the provenance whose
 *  page the value links to. */
export type DetailRow = {
    label: string;
    value: string;
    /** the one source the answer serves; its page is linked when the answer
     *  names its document */
    source?: { ref: string; documentation: string | null };
};

/** The panel's Details rows, describing the file a download writes: its
 *  years, series, unit and licence from `resolved.download` (years and
 *  series qualified as upper bounds as the row count is), its size once a
 *  download has measured it, and the gaps in a broad answer, each open axis
 *  that some variables state no value for. The licence links to the page of
 *  the one source the answer serves. */
export const detailRows = (spec: any, fileBytes: number | null = null): DetailRow[] => {
    const download = spec?.download;
    const rows: DetailRow[] = [];
    const years = detailYears(download);
    const unit = unitText(spec);

    if (years) {
        rows.push({ label: 'Years', value: years });
    }

    if (download?.series != null) {
        const series = formatCount(download.series);

        rows.push({
            label: 'Series',
            value: download.rows_exact === false ? `up to ${series}` : series,
        });
    }

    if (unit) {
        rows.push({ label: 'Unit', value: unit });
    }

    const licence = licenceText(spec);

    if (licence) {
        const sources = spec?.resolution?.resolved_sources ?? [];
        const [source] = sources;

        rows.push({
            label: 'Licence',
            value: licence,
            ...(sources.length === 1 && source?.ref
                ? { source: { ref: source.ref, documentation: source.documentation ?? null } }
                : {}),
        });
    }

    if (fileBytes != null) {
        rows.push({ label: 'File size', value: formatBytes(fileBytes) });
    }

    const gaps = (spec?.open_axis_facts ?? [])
        .filter((fact: any) => fact?.distinct_count > 0 && fact.undeclared_count > 0)
        .map(
            (fact: any) =>
                `${countNoun(fact.undeclared_count, 'variable')} ${
                    fact.undeclared_count === 1 ? 'states' : 'state'
                } no ${axisLabel(spec, fact.property)}`,
        );

    if (gaps.length > 0) {
        rows.push({ label: 'Gaps', value: gaps.join('; ') });
    }

    return rows;
};

// ---------------------------------------------------------------------------
// Operation progress (the async worker's 202 poll — see operationPoll.ts)
// ---------------------------------------------------------------------------

/** "1,234 of 2,500,000 rows written" for the download button's in-progress
 *  label while an over-budget mint runs as a polled operation. */
export const operationProgressText = (progress: OperationProgress): string =>
    `${formatCount(progress.rows_written)} of ${formatCount(progress.estimate_rows)} rows written`;
