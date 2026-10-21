/* eslint-disable @typescript-eslint/no-explicit-any -- takes specs and options of either picker shape as `any` and reads only the members each editor shows, tolerating any that is missing */
'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useEffect, useRef, useState } from 'react';

import styles from './DataSearch.module.scss';
import {
    AnySelectionRow,
    MultiSelectApplyButton,
    NoFilterMatch,
    OptionFilterBar,
    OptionFilterInput,
    OptionRow,
    stopMenuFieldTypeahead,
    useToggleSelection,
} from './SlotMenu';

import Button from '@/components/atoms/Button/Button';
import {
    filterOptionsByQuery,
    mergeEntitySeedWithFetch,
    shouldShowOptionFilter,
} from '@/lib/search/pickerState';
import type { ApiError, EntityOption } from '@/lib/search/searchClient';
import { entityOptions } from '@/lib/search/searchClient';
import type { EntityRoleKey, IdentityWindow, PlaceOptionsScope } from '@/lib/search/types';
import {
    buildPlaceOptionGroups,
    optionCoverageLabel,
    optionMuted,
    placeEditorScopes,
    placeOptionsSignature,
    planPlaceOptions,
    rankOptionsByCoverage,
    showGroupHeadings,
    splitCurrentPick,
} from '@/lib/search/view';
import type { PlaceOptionScopeResult, PlaceOptionsEntry } from '@/lib/search/view';
import {
    allYearsApplyValue,
    buildRangeApplyValue,
    isAllYearsWindow,
    seedWindowYears,
    windowApplyValueUnchanged,
    type WindowApplyValue,
} from '@/lib/search/windowState';

/** Always rendered inside a SlotMenu, so its inputs pick up the shared
 *  keyboard mechanism via data-menu-field. Apply carries the same
 *  attribute so it joins the arrow-key sequence instead of sitting past
 *  Radix's roving focus, unreachable except by mouse. */
export const WindowEditor = ({
    spec,
    label,
    onApply,
}: {
    spec: any;
    label?: string;
    onApply: (value: WindowApplyValue) => void;
}) => {
    const requestedWindow: IdentityWindow | undefined = spec?.identity?.requested_window;
    const years = (spec?.observations?.series ?? [])
        .flatMap((series: any) => series?.points ?? [])
        .map((point: any) => parseInt(point?.date, 10))
        .filter((year: number) => !Number.isNaN(year));
    const seed = seedWindowYears({
        requestedWindow,
        coverageWindow: spec?.coverage?.window,
        label,
        observationYears: years,
    });

    const [start, setStart] = useState(seed.start);
    const [end, setEnd] = useState(seed.end);

    const applyValue = buildRangeApplyValue(start, end);
    // Applying the current range would just re-run the identical query.
    const unchanged = applyValue !== null && windowApplyValueUnchanged(applyValue, requestedWindow);

    return (
        <>
            {/* Same OptionRow checked pattern as every other menu's "Any X"
                row: checked against the spec's own current requested_window,
                picking it posts immediately rather than waiting on Apply. */}
            <DropdownMenu.Item asChild onSelect={() => onApply(allYearsApplyValue())}>
                <OptionRow checked={isAllYearsWindow(requestedWindow)}>All years</OptionRow>
            </DropdownMenu.Item>
            <form
                className={styles.windowEditor}
                onSubmit={(event) => {
                    event.preventDefault();

                    if (applyValue && !unchanged) {
                        onApply(applyValue);
                    }
                }}
            >
                <div className={styles.windowInputs}>
                    <input
                        className={styles.windowInput}
                        data-menu-field="field"
                        value={start}
                        onChange={(event) => setStart(event.target.value)}
                        onKeyDown={stopMenuFieldTypeahead}
                        inputMode="numeric"
                        placeholder="From"
                        aria-label="Start year"
                        autoComplete="off"
                    />
                    <span aria-hidden="true">–</span>
                    <input
                        className={styles.windowInput}
                        data-menu-field="field"
                        value={end}
                        onChange={(event) => setEnd(event.target.value)}
                        onKeyDown={stopMenuFieldTypeahead}
                        inputMode="numeric"
                        placeholder="Latest"
                        aria-label="End year"
                        autoComplete="off"
                    />
                </div>
                <Button
                    variant="dark"
                    full
                    type="submit"
                    data-menu-field="field"
                    disabled={!applyValue || unchanged}
                >
                    Apply
                </Button>
            </form>
        </>
    );
};

/**
 * Free-text phrase editor: whatever the user types replaces this phrase and
 * the whole sentence re-runs as a fresh raw-text query. `label` names the
 * field and, given an empty `initial`, shows as its placeholder.
 */
export const PhraseEditor = ({
    initial,
    label = 'Replace phrase',
    onApply,
}: {
    initial: string;
    label?: string;
    onApply: (text: string) => void;
}) => {
    const [value, setValue] = useState(initial);
    // Applying the unchanged phrase would just re-run the identical query.
    const unchanged = value.trim() === initial.trim();

    return (
        <form
            className={styles.phraseEditor}
            onSubmit={(event) => {
                event.preventDefault();

                if (value.trim() && !unchanged) {
                    onApply(value);
                }
            }}
        >
            {/* data-menu-field (unqualified, not "filter") makes this a stop for
                the keyboard mechanism without making it a typing-redirect or
                open-focus target: arrows still step to the row above, but a
                keyboard open or typed character never lands here first. */}
            <input
                className={styles.slotInput}
                data-menu-field="field"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={stopMenuFieldTypeahead}
                aria-label={label}
                placeholder={initial ? undefined : label}
                autoComplete="off"
            />
            <Button
                variant="dark"
                full
                type="submit"
                data-menu-field="field"
                disabled={!value.trim() || unchanged}
            >
                Apply
            </Button>
        </form>
    );
};

/** A refusal's own `code`/`pointer` (see searchClient's `apiError`), folded
 *  into one line without inventing detail the payload doesn't carry — the
 *  fallback only fires for a refusal shaped so differently neither field
 *  came through. */
const failureMessage = (error: ApiError): string => {
    const detail = [error.code, error.pointer].filter(Boolean).join(' · ');

    return detail
        ? `Couldn't check for alternatives (${detail}).`
        : "Couldn't check for alternatives.";
};

type PlaceEditorState =
    | { phase: 'loading' }
    | { phase: 'loaded'; groups: { title: string; options: any[] }[] }
    | { phase: 'failed'; error: ApiError };

/** One PlaceEditor mount's decisions for its current (spec, anchor, role,
 *  retry) identity, held across effect re-runs so a prefetch arrival can be
 *  reacted to without redoing work an earlier run already settled. */
type CommittedPlaceOptions = {
    /** Changes only on a genuinely new pick or a Retry click — everything
     *  below resets when it does. */
    key: string;
    /** Scopes whose source is decided: either a matching prefetch was found,
     *  or a live fetch has already been dispatched for it. A prefetch entry
     *  that arrives for a locked scope afterwards changes nothing — the
     *  first decision wins, which is the no-flicker rule. */
    locked: Set<PlaceOptionsScope>;
    /** Settled outcomes for every locked scope that has actually finished —
     *  a prefetch hit settles the instant it locks; a live fetch settles
     *  once its promise resolves. Rendered once this covers every scope
     *  PlaceEditor asked for, all at once, so no group ever appears ahead
     *  of its sibling. */
    results: Map<PlaceOptionsScope, PlaceOptionScopeResult>;
    /** The grace period's wall-clock deadline, fixed the first time this
     *  key needs to wait and never pushed back out by a later prefetch
     *  arrival or re-render — otherwise a trickle of unrelated events could
     *  keep resetting the clock and "at most ~250ms" would mean nothing. */
    deadline: number | null;
    timer: ReturnType<typeof setTimeout> | null;
};

const freshCommitted = (key: string): CommittedPlaceOptions => ({
    key,
    locked: new Set(),
    results: new Map(),
    deadline: null,
    timer: null,
});

/**
 * Place editor: which places actually HAVE data for this spec — peers of the
 * current one and places within it — plus free text. A `place_options`
 * trailing event may have already prefetched one or both scopes (see
 * useSearchRun.ts's placeOptionsBySpec); this only posts to the `options`
 * door for whichever scope(s) that snapshot doesn't cover.
 */
/** Only meaningful for a directional role. Null for a subject place,
 *  which has no unbind row. */
export const unbindRoleLabel = (role?: EntityRoleKey): string | null => {
    if (role === 'origin') return 'Any provider';
    if (role === 'destination') return 'Any recipient';
    return null;
};

export const PlaceEditor = ({
    spec,
    anchorDcid,
    boundDcids,
    onPick,
    onApply,
    onSelect,
    requireSelection,
    offerAny,
    prefetched,
    role,
    baseStreamOpen,
}: {
    spec: any;
    /** Keys this editor's reactive prefetch effect. Read boundDcids for the
     *  full pinned/checked set, this is never more than its first member. */
    anchorDcid: string;
    /** Pinned at the top of the list, checked, and seeding the toggle
     *  selection Apply posts. */
    boundDcids: string[];
    onPick: (text: string) => void;
    /** Multi-select mode: exactly one of onApply/onSelect is passed by any
     *  caller. Toggling stays open behind a sticky Apply, which posts the
     *  whole checked set, empty when Apply is pressed with nothing
     *  checked, which a directional caller posts as "drop the role". */
    onApply?: (refs: { dcid: string; label: string }[]) => void;
    /** Single-pick mode: a hoisted/shared caller has no structured
     *  multi-value edit for a token several parts share, so a row click
     *  posts that one option immediately and closes the menu, no toggle
     *  state, no Apply button. */
    onSelect?: (ref: { dcid: string; label: string }) => void;
    /** Multi-select mode only, for a route that can't express an empty
     *  selection (a raw-text splice has no "unbind" to fall back on):
     *  disables Apply instead of posting nothing on an empty selection. */
    requireSelection?: boolean;
    /** Multi-select mode, set only by a per-part directional anchor (never
     *  the shared/hoisted picker, and never for a subject place, which has
     *  no entities.<role> to unbind): an "Any provider"/"Any recipient" row
     *  (AnySelectionRow) that stages the empty selection. */
    offerAny?: boolean;
    /** Prefetched place_options entries, by scope. PlaceOptionsEvent's own
     *  role is always observationAbout, so a directional `role` here ignores
     *  this prop even if a caller passes one — it can only ever race a
     *  subject-place identity's own peers/children, never a provider/recipient
     *  candidate list. */
    prefetched?: Partial<Record<PlaceOptionsScope, PlaceOptionsEntry>>;
    /** the anchor entity's own role; omitted (subject) takes the door's
     *  'observationAbout' default, a directional token names 'origin' or
     *  'destination' so a CRS provider/recipient anchor stops posting the
     *  subject role a directional identity refuses. */
    role?: EntityRoleKey;
    /** True while the BASE run's own resolve stream (the raw_text run, or
     *  the initial dataset_resubmit a share/replay starts through
     *  useSearchRun's `startRun`) hasn't reached `done` yet — the caller
     *  passes `phase === 'loading'` (useSearchRun's run-level field), never
     *  a part's own phase. That stream is the only one whose trailing
     *  events can still carry a `place_options` entry for this spec; an
     *  edit post (editSlot/editEntity/editWindow/editShared/pickCandidate,
     *  tracked by `editPostInFlight` instead) never emits one for the part
     *  it's touching, even though that part's own phase reads 'loading'
     *  too while the post is in flight. Reading the part's phase here would
     *  make a click during an edit post wait out the whole grace for an
     *  event that isn't coming. False (or omitted) means nothing further is
     *  coming for this spec, so a still-missing scope goes live immediately
     *  — see the effect below. */
    baseStreamOpen?: boolean;
}) => {
    const [state, setState] = useState<PlaceEditorState>({ phase: 'loading' });
    // Bumped by the failed state's Retry button to re-run the effect below.
    const [retryToken, setRetryToken] = useState(0);
    const [filter, setFilter] = useState('');
    const {
        selected,
        toggle,
        clear,
        applyDisabled: boundSetUnchanged,
    } = useToggleSelection(boundDcids);

    const committedRef = useRef<CommittedPlaceOptions>(freshCommitted(''));
    // True until the component actually unmounts -- distinct from "this
    // effect invocation was superseded by a rerun for the same identity",
    // which `committedRef.current === committed` below tests instead. A
    // fetch's `.then()` can only be sure the promise it's holding still
    // matters by checking against the ref, not a per-invocation flag: an
    // effect rerun that keeps the same key (a prefetch arrival, a
    // baseStreamOpen flip, or React Strict Mode's dev-only double-invoke)
    // reuses the same `committed` object, so a flag reset to false by the
    // superseded invocation's own cleanup would permanently orphan a fetch
    // that the current run is still counting on.
    const mountedRef = useRef(true);
    useEffect(() => {
        // Reset on every invocation, not just declared once via useRef's
        // initial value: React Strict Mode's dev-only double-invoke runs
        // this effect's cleanup (setting the flag false) between the first
        // and second mount of the SAME component instance, and only
        // setting it back to true here, on the second mount's setup, keeps
        // it from reading as permanently unmounted for the rest of that
        // instance's real life.
        mountedRef.current = true;

        return () => {
            mountedRef.current = false;
        };
    }, []);
    // A primitive dependency for the effect below: changes exactly when one
    // of this editor's own scopes gains, loses, or replaces a prefetched
    // entry — see placeOptionsSignature's own doc. Computed on every render
    // (cheap: a two-element map/join), not derived inside the effect, so
    // the dependency array can hold a plain variable instead of a call
    // expression eslint's exhaustive-deps can't statically check.
    const prefetchSignature = placeOptionsSignature(
        placeEditorScopes(role, boundDcids.length),
        prefetched,
    );
    // No identity at all (nothing to look up) is a fixed answer derived
    // straight from `spec` -- rendered straight through below instead of
    // being pushed into `state` via an effect (there's no fetch, timer, or
    // prefetch to react to for it, only a prop to read).
    const hasIdentity = !!spec.identity;

    useEffect(() => {
        if (!hasIdentity) return;

        const key = `${spec.spec_id}::${anchorDcid}::${role ?? ''}::${retryToken}`;

        // A genuinely new pick (or a Retry): start over. Anything else
        // reaching this point is a prefetch arrival or a base-stream close;
        // it builds on what `committedRef` already decided, so a rerun
        // never redoes work an earlier run already settled.
        if (committedRef.current.key !== key) {
            if (committedRef.current.timer) clearTimeout(committedRef.current.timer);
            committedRef.current = freshCommitted(key);
            setState({ phase: 'loading' });
        }

        const committed = committedRef.current;

        const scopes = placeEditorScopes(role, boundDcids.length);
        // The whole lock/dispatch/reveal/wait decision, in one pure call —
        // see planPlaceOptions' own doc in lib/search/view.ts. This effect
        // only executes what it returns.
        const plan = planPlaceOptions(
            scopes,
            prefetched,
            anchorDcid,
            role,
            committed.locked,
            baseStreamOpen,
            committed.deadline,
            Date.now(),
        );

        for (const { scope, entry } of plan.lockFromPrefetch) {
            committed.locked.add(scope);
            committed.results.set(scope, { status: 'fulfilled', value: entry });
        }

        // Guards every asynchronous callback below against a stale
        // invocation: true exactly while `committed` is still the object
        // `committedRef` currently points at (this identity hasn't been
        // replaced by a genuinely new pick) and the component hasn't
        // actually unmounted. An effect rerun that keeps the same key
        // never fails this, so a fetch dispatched by an earlier invocation
        // for the SAME identity still gets to call `reveal()` when it
        // settles -- an `alive` flag scoped to one invocation would
        // wrongly discard it the moment that invocation's own cleanup ran
        // (every rerun's cleanup fires before the next run, including
        // React Strict Mode's dev-only double-invoke on mount).
        const current = () => mountedRef.current && committedRef.current === committed;

        const reveal = () => {
            if (!current() || committed.results.size < scopes.length) return;

            for (const scope of scopes) {
                const result = committed.results.get(scope);

                // A refusal (e.g. the scope being unsupported for this
                // anchor type) drops that scope's group as long as the
                // OTHER scope came back — buildPlaceOptionGroups below
                // shows a failed state only when neither scope
                // succeeds, so a real refusal reads differently from a
                // silent "no alternatives". Logged here rather than
                // inside the pure builder, which has no side effects of
                // its own.
                if (result?.status === 'rejected') {
                    const error = result.reason;

                    console.error(
                        `[PlaceEditor] entityOptions(${scope}) failed: ` +
                            `${error.status ?? '?'} ${error.code ?? error.message}` +
                            (error.pointer ? ` at ${error.pointer}` : ''),
                    );
                }
            }

            const { groups, anySucceeded, lastError } = buildPlaceOptionGroups(
                scopes,
                committed.results,
            );

            setState(
                anySucceeded
                    ? { phase: 'loaded', groups }
                    : { phase: 'failed', error: lastError as ApiError },
            );
        };

        const dispatch = (scopesToFetch: PlaceOptionsScope[]) => {
            scopesToFetch.forEach((scope) => committed.locked.add(scope));

            // Concurrent — these are independent door calls, and
            // awaiting them in series just adds one full round trip's
            // latency to the second group. Group order (Similar places,
            // then Within) comes from `scopes`, not settle order.
            void Promise.allSettled(
                scopesToFetch.map((scope) =>
                    entityOptions({ identity: spec.identity, scope, role }),
                ),
            ).then((settled) => {
                if (!current()) return;

                scopesToFetch.forEach((scope, i) => committed.results.set(scope, settled[i]));
                reveal();
            });
        };

        if (plan.reveal) {
            // Every scope was either already locked by an earlier run,
            // or just matched a prefetch above — the common warm-hit
            // case: zero network requests, both groups rendered
            // together.
            reveal();
        } else if (plan.dispatchNow.length > 0) {
            // Nothing more can arrive for this spec — a scope the
            // server dropped outright (a refused `children`, or one
            // whose task hit the door's own cap) would otherwise wait
            // forever for an event that is never coming. Go live now;
            // this is the only thing that ends that wait, so it must
            // not depend on any signal from the dropped scope itself.
            dispatch(plan.dispatchNow);
        } else if (plan.wait) {
            // Still waiting on the base stream. The deadline is set
            // once per `key` and never pushed back out by a later
            // arrival or re-render (planPlaceOptions keeps whatever
            // deadline `committed` already committed to), so the total
            // wait for any one scope is capped at PREFETCH_GRACE_MS from
            // the first time this key needed it, not reset on every
            // rerun this effect's own dependencies cause.
            committed.deadline = plan.wait.deadline;

            committed.timer = setTimeout(() => {
                committed.timer = null;

                const stillMissingAtDeadline = scopes.filter(
                    (scope) => !committed.locked.has(scope),
                );

                if (stillMissingAtDeadline.length > 0) dispatch(stillMissingAtDeadline);
            }, plan.wait.delayMs);
        }

        return () => {
            if (committed.timer) {
                clearTimeout(committed.timer);
                committed.timer = null;
            }
        };
        // Keyed on spec.spec_id (and, transitively, spec.identity — stable
        // together for a given spec_id), not `spec` itself: an unrelated
        // trailing SSE event (observations/facet_options/slot_options)
        // rebuilds every part's hydratedSpec object on every render
        // (useSearchRun.ts's hydrateDefiniteSpec), so watching `spec` by
        // reference would rerun this whole effect — discarding an
        // already-loaded or in-flight fetch — on updates that have nothing
        // to do with this popover. `placeOptionsSignature` is the deliberate
        // exception: built to change only when one of `scopes`' own
        // prefetch entries newly arrives, is replaced, or clears, which is
        // exactly when this effect needs to reconsider — `committedRef`'s
        // `locked` set above makes that reconsideration a no-op for
        // anything an earlier run already decided, so reacting to it here
        // costs nothing extra.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spec.spec_id, anchorDcid, role, retryToken, prefetchSignature, baseStreamOpen]);

    // Exactly one of onApply/onSelect is passed by any caller (see their own
    // docs above). This decides which UI the rows and the tail of this menu
    // render.
    const multiSelect = !!onApply;
    const loadedGroups = state.phase === 'loaded' ? state.groups : [];
    const boundSet = new Set(boundDcids);
    const applyDisabled = boundSetUnchanged || (!!requireSelection && selected.size === 0);
    const pick = (option: { dcid: string; label: string }) => onSelect?.(option);
    // Each pinned option is pulled out of whichever group it lives in and
    // rendered once above every group. A dcid the API listed under more
    // than one group dedupes to its first occurrence.
    const groupSplits = loadedGroups.map((group) => ({
        title: group.title,
        ...splitCurrentPick(group.options, boundSet),
    }));
    const seenPinned = new Set<string>();
    const pinnedOptions = groupSplits
        .flatMap((group) => group.current)
        .filter((option: any) => {
            if (seenPinned.has(option.dcid)) return false;
            seenPinned.add(option.dcid);
            return true;
        });
    const unfilteredGroups = groupSplits
        .map((group) => ({ title: group.title, options: group.rest }))
        .filter((group) => group.options.length > 0);
    const filteredGroups = unfilteredGroups
        .map((group) => ({
            ...group,
            options: filterOptionsByQuery(group.options, filter, (option: any) => option.label),
        }))
        .filter((group) => group.options.length > 0);
    const unbindLabel = unbindRoleLabel(role);
    const trimmedFilter = filter.trim();
    // "Listed" means currently on screen, post-filter — a text that exactly
    // names a visible row would just duplicate that row's own click, so the
    // row is enough and the Search action stays hidden.
    const listedLabels = new Set(
        [...pinnedOptions, ...filteredGroups.flatMap((group) => group.options)].map((option: any) =>
            option.label.toLowerCase(),
        ),
    );
    const showSearchRow = trimmedFilter !== '' && !listedLabels.has(trimmedFilter.toLowerCase());

    return (
        <>
            {/* The menu's one input: it filters the rows and feeds the
                Search row. Rendered in every phase, since a failed lookup is
                when typing a place by hand matters most. */}
            <OptionFilterBar
                count={
                    state.phase === 'loaded' && unfilteredGroups.length > 0
                        ? {
                              shown: filteredGroups.flatMap((group) => group.options).length,
                              total: unfilteredGroups.flatMap((group) => group.options).length,
                          }
                        : null
                }
            >
                <input
                    className={styles.slotInput}
                    data-menu-field="filter"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    onKeyDown={(event) => {
                        stopMenuFieldTypeahead(event);

                        if (event.key === 'Enter' && showSearchRow) {
                            event.preventDefault();
                            onPick(filter);
                        }
                    }}
                    placeholder="Filter or type a place…"
                    aria-label="Filter or type a place"
                    autoComplete="off"
                />
            </OptionFilterBar>
            {hasIdentity && state.phase === 'loading' && (
                <p className={styles.slotNote}>Checking places with data…</p>
            )}
            {hasIdentity && state.phase === 'failed' && (
                <div className={styles.slotFailed}>
                    <p className={styles.slotNote}>{failureMessage(state.error)}</p>
                    <Button
                        variant="bordered"
                        small
                        onClick={() => setRetryToken((token) => token + 1)}
                    >
                        Retry
                    </Button>
                </div>
            )}
            {offerAny && multiSelect && unbindLabel && (
                <AnySelectionRow label={unbindLabel} selected={selected} onClear={clear} />
            )}
            {/* No identity at all reads the same as a settled empty list —
                see `hasIdentity`'s own doc above. */}
            {(!hasIdentity || (state.phase === 'loaded' && unfilteredGroups.length === 0)) && (
                <p className={styles.slotNote}>No alternatives found.</p>
            )}
            {/* Every currently-bound option, split out of its own group above
                (see `pinnedOptions`' own doc), shown once, at the top of
                the list, rather than in its usual ranked spot within a
                group. Multi-select: a toggle like every other row here.
                Unchecking one and pressing Apply with nothing else picked
                drops the role, the same empty selection the "Any provider"/
                "Any recipient" row above stages. Single-pick: clicking a pinned row re-posts it and
                closes the menu, same as any other row. */}
            {hasIdentity &&
                state.phase === 'loaded' &&
                pinnedOptions.map((option: any) => (
                    <DropdownMenu.Item
                        key={option.dcid}
                        asChild
                        onSelect={(event) => {
                            if (multiSelect) {
                                event.preventDefault();
                                toggle(option.dcid);
                                return;
                            }

                            pick(option);
                        }}
                    >
                        <OptionRow
                            checked={multiSelect ? selected.has(option.dcid) : true}
                            pinned
                            toggle={multiSelect}
                            meta={optionCoverageLabel(option)}
                        >
                            {option.label}
                        </OptionRow>
                    </DropdownMenu.Item>
                ))}
            {hasIdentity &&
                state.phase === 'loaded' &&
                filteredGroups.map((group) => (
                    <div key={group.title}>
                        {showGroupHeadings(unfilteredGroups) && (
                            <p className={styles.slotGroupTitle}>{group.title}</p>
                        )}
                        {group.options.map((option: any) => (
                            <DropdownMenu.Item
                                key={option.dcid}
                                asChild
                                onSelect={(event) => {
                                    if (multiSelect) {
                                        event.preventDefault();
                                        toggle(option.dcid);
                                        return;
                                    }

                                    pick(option);
                                }}
                            >
                                <OptionRow
                                    checked={multiSelect ? selected.has(option.dcid) : undefined}
                                    toggle={multiSelect}
                                    meta={optionCoverageLabel(option)}
                                >
                                    {option.label}
                                </OptionRow>
                            </DropdownMenu.Item>
                        ))}
                    </div>
                ))}
            {hasIdentity &&
                state.phase === 'loaded' &&
                unfilteredGroups.length > 0 &&
                filteredGroups.length === 0 && <NoFilterMatch />}
            {/* The raw-text escape hatch: hidden once the typed text already
                names a row above verbatim, since clicking that row does the
                same thing. */}
            {showSearchRow && (
                <DropdownMenu.Item asChild onSelect={() => onPick(filter)}>
                    <OptionRow>Search “{trimmedFilter}”</OptionRow>
                </DropdownMenu.Item>
            )}
            {/* Posts the whole toggled set in one identity edit. Disabled
                while it reads back the same as the role's own currently-bound
                set (the same "this would just re-run the identical query"
                gate WindowEditor/PhraseEditor's own Apply already uses), or
                while requireSelection has nothing checked, for a route that
                can't express an empty pick. Pinned to the bottom of
                .slotMenuBody's own scroll area (styles.multiSelectApply) so a
                long list (hundreds of CRS provider/recipient rows) never
                scrolls it out of reach. Single-pick mode never renders this:
                every row above posts on its own. */}
            {hasIdentity && state.phase === 'loaded' && multiSelect && (
                <MultiSelectApplyButton
                    selected={selected}
                    disabled={applyDisabled}
                    onApply={() => {
                        const labelByDcid = new Map(
                            loadedGroups.flatMap((group) =>
                                group.options.map((option: any) => [option.dcid, option.label]),
                            ),
                        );

                        onApply?.(
                            [...selected].map((dcid) => ({
                                dcid,
                                label: labelByDcid.get(dcid) ?? dcid,
                            })),
                        );
                    }}
                />
            )}
        </>
    );
};

/**
 * Lists the peers surface: every candidate that actually has data for the
 * spec's stat vars, filterable past the length threshold. Picking binds the
 * where slot or directional role directly, no re-grounding. seed is the
 * per-part menu's already-streamed entity_options for this (spec, role),
 * rendered immediately and merged with this component's own live peers
 * fetch once it settles.
 */
type PlaceScopeEditorState =
    | { phase: 'loading' }
    | { phase: 'loaded'; options: EntityOption[]; truncated: boolean }
    | { phase: 'failed'; error: ApiError };

const placeRoleLabel = (role: EntityRoleKey): string => {
    if (role === 'origin') return 'providers';
    if (role === 'destination') return 'recipients';
    return 'places';
};

const seededState = (
    seed: { options: any[]; truncated: boolean } | undefined,
): PlaceScopeEditorState =>
    seed
        ? {
              phase: 'loaded',
              options: mergeEntitySeedWithFetch(seed.options, null),
              truncated: seed.truncated,
          }
        : { phase: 'loading' };

export const PlaceScopeEditor = ({
    spec,
    role,
    onApply,
    onSelect,
    seed,
    currentDcids,
    rankingBlocked,
    offerAny,
}: {
    spec: any;
    role: EntityRoleKey;
    /** Multi-select mode: see PlaceEditor's own onApply/onSelect doc above.
     *  Exactly one of the two is passed by any caller. */
    onApply?: (refs: { dcid: string; label: string }[]) => void;
    /** Single-pick mode: a row click posts immediately and closes the menu,
     *  no toggle state, no Apply button. */
    onSelect?: (ref: { dcid: string; label: string }) => void;
    seed?: { options: any[]; truncated: boolean };
    /** Split out of the merged list and shown once, above it, checked/
     *  pinned. Omitted (or []) for an unbound axis with no current pick to
     *  protect. */
    currentDcids?: string[];
    /** Skips the richest-first reorder so a partially-probed list isn't
     *  floated to an alphabetical subset. Muting a confirmed no-data option
     *  still applies. */
    rankingBlocked?: boolean;
    /** Multi-select mode, per-part directional role only: see PlaceEditor's
     *  own offerAny doc above. */
    offerAny?: boolean;
}) => {
    const [state, setState] = useState<PlaceScopeEditorState>(() => seededState(seed));
    const [filter, setFilter] = useState('');
    // Bumped by the failed state's Retry button to re-run the effect below.
    const [retryToken, setRetryToken] = useState(0);
    const { selected, toggle, clear, applyDisabled } = useToggleSelection(currentDcids ?? []);

    // Read inside the effect's closure without adding seed to its
    // dependency array, since a caller building seed inline would otherwise
    // re-run the fetch every render.
    const seedRef = useRef(seed);

    useEffect(() => {
        seedRef.current = seed;
    }, [seed]);

    useEffect(() => {
        let alive = true;

        (async () => {
            if (!seedRef.current) {
                setState({ phase: 'loading' });
            }

            if (!spec.identity) {
                if (alive) {
                    setState({ phase: 'loaded', options: [], truncated: false });
                }

                return;
            }

            try {
                const res = await entityOptions({
                    identity: spec.identity,
                    scope: 'peers',
                    role,
                });

                if (alive) {
                    setState({
                        phase: 'loaded',
                        // The live peers fetch is authoritative once it lands. Its
                        // own truncated flag decides whether more exists,
                        // regardless of whether the seed was capped.
                        options: mergeEntitySeedWithFetch(
                            seedRef.current?.options ?? [],
                            res.options,
                        ),
                        truncated: res.truncated,
                    });
                }
            } catch (err) {
                // Unless a seed already has something to show, in which case
                // that stays up rather than replacing a real (if incomplete)
                // list with an unactionable failure.
                const apiErr = err as ApiError;

                console.error(
                    `[PlaceScopeEditor] entityOptions(peers) failed: ` +
                        `${apiErr.status ?? '?'} ${apiErr.code ?? apiErr.message}` +
                        (apiErr.pointer ? ` at ${apiErr.pointer}` : ''),
                );

                if (alive) {
                    const seededOnly = mergeEntitySeedWithFetch(
                        seedRef.current?.options ?? [],
                        null,
                    );

                    setState(
                        seededOnly.length > 0
                            ? {
                                  phase: 'loaded',
                                  options: seededOnly,
                                  truncated: seedRef.current?.truncated ?? false,
                              }
                            : { phase: 'failed', error: apiErr },
                    );
                }
            }
        })();

        return () => {
            alive = false;
        };
        // Keyed on spec.spec_id (and spec.identity's presence, since the
        // body branches on it), not `spec` itself: useSearchRun's `parts`
        // memo rebuilds every hydratedSpec object on each streamed event, so
        // watching `spec` by reference would refetch peers on every event
        // while a query streams, even though the spec this popover is open
        // for hasn't changed. Same pattern PlaceEditor uses above, for the
        // same reason.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spec.spec_id, !!spec.identity, role, retryToken]);

    // Exactly one of onApply/onSelect is passed by any caller (see their own
    // docs above). This decides which UI the rows and Apply render.
    const multiSelect = !!onApply;
    const boundSet = new Set(currentDcids ?? []);
    const { current, rest } =
        state.phase === 'loaded'
            ? splitCurrentPick(state.options, boundSet)
            : { current: [], rest: [] };
    const ranked = rankingBlocked ? rest : rankOptionsByCoverage(rest);
    const showFilter = shouldShowOptionFilter(ranked.length);
    const shown = showFilter
        ? filterOptionsByQuery(ranked, filter, (option) => option.label)
        : ranked;
    const pick = (option: { dcid: string; label: string }) => onSelect?.(option);
    const anyLabel = offerAny && multiSelect ? unbindRoleLabel(role) : null;

    return (
        <>
            {anyLabel && <AnySelectionRow label={anyLabel} selected={selected} onClear={clear} />}
            {state.phase === 'loading' && (
                <p className={styles.slotNote}>Checking {placeRoleLabel(role)} with data…</p>
            )}
            {state.phase === 'failed' && (
                <div className={styles.slotFailed}>
                    <p className={styles.slotNote}>{failureMessage(state.error)}</p>
                    <Button
                        variant="bordered"
                        small
                        onClick={() => setRetryToken((token) => token + 1)}
                    >
                        Retry
                    </Button>
                </div>
            )}
            {state.phase === 'loaded' && state.options.length === 0 && !state.truncated && (
                <p className={styles.slotNote}>
                    No {placeRoleLabel(role)} are available for this dataset.
                </p>
            )}
            {state.phase === 'loaded' && (state.options.length > 0 || state.truncated) && (
                <>
                    {showFilter && (
                        <OptionFilterBar count={{ shown: shown.length, total: ranked.length }}>
                            <OptionFilterInput
                                value={filter}
                                onChange={setFilter}
                                label={`Filter listed ${placeRoleLabel(role)}`}
                            />
                        </OptionFilterBar>
                    )}
                    {/* Every currently-bound option, split out above (see
                        `current`'s own doc above), shown once, ahead of the
                        scrollable list below, rather than repeated inside
                        it. Multi-select: a toggle like every other row here.
                        Single-pick: clicking a pinned row re-posts it and
                        closes the menu. */}
                    {current.map((option) => (
                        <DropdownMenu.Item
                            key={option.dcid}
                            asChild
                            onSelect={(event) => {
                                if (multiSelect) {
                                    event.preventDefault();
                                    toggle(option.dcid);
                                    return;
                                }

                                pick(option);
                            }}
                        >
                            <OptionRow
                                checked={multiSelect ? selected.has(option.dcid) : true}
                                pinned
                                toggle={multiSelect}
                                muted={optionMuted(option)}
                                meta={optionCoverageLabel(option)}
                            >
                                {option.label}
                            </OptionRow>
                        </DropdownMenu.Item>
                    ))}
                    <div className={styles.placeList}>
                        {shown.map((option) => (
                            <DropdownMenu.Item
                                key={option.dcid}
                                asChild
                                onSelect={(event) => {
                                    if (multiSelect) {
                                        event.preventDefault();
                                        toggle(option.dcid);
                                        return;
                                    }

                                    pick(option);
                                }}
                            >
                                <OptionRow
                                    checked={multiSelect ? selected.has(option.dcid) : undefined}
                                    toggle={multiSelect}
                                    muted={optionMuted(option)}
                                    meta={optionCoverageLabel(option)}
                                >
                                    {option.label}
                                </OptionRow>
                            </DropdownMenu.Item>
                        ))}
                        {shown.length === 0 && (
                            <p className={styles.slotNote}>
                                {state.truncated
                                    ? `No matching ${placeRoleLabel(role)} in this list.`
                                    : 'No match — clear the filter.'}
                            </p>
                        )}
                    </div>
                    {state.truncated && (
                        <p className={styles.slotNote}>
                            This server response is capped; more {placeRoleLabel(role)} may exist.
                        </p>
                    )}
                    {/* Posts the whole toggled set in one identity edit.
                        Disabled while it reads back the same as the role's
                        own currently-bound set. Pinned to the bottom of
                        .slotMenuBody's own scroll area (styles.
                        multiSelectApply) so a long list (hundreds of CRS
                        provider/recipient rows) never scrolls it out of
                        reach. Single-pick mode never renders this: every row
                        above posts on its own. */}
                    {multiSelect && (
                        <MultiSelectApplyButton
                            selected={selected}
                            disabled={applyDisabled}
                            onApply={() => {
                                const labelByDcid = new Map(
                                    state.phase === 'loaded'
                                        ? state.options.map((option) => [option.dcid, option.label])
                                        : [],
                                );

                                onApply?.(
                                    [...selected].map((dcid) => ({
                                        dcid,
                                        label: labelByDcid.get(dcid) ?? dcid,
                                    })),
                                );
                            }}
                        />
                    )}
                </>
            )}
        </>
    );
};
