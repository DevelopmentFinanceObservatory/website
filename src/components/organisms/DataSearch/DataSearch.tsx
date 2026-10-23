'use client';

import classNames from 'classnames';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import styles from './DataSearch.module.scss';
import ReadingCards from './ReadingCards';
import SearchAnswer from './SearchAnswer';
import SearchHint from './SearchHint';
import SearchCards from './SearchCards';
import SearchPanel from './SearchPanel';
import SearchShareModal from './SearchShareModal';
import type { CreateSearchShare } from './SearchShare';
import {
    answerRefineItems,
    headingTokens,
    SearchSentenceBody,
    SearchSentenceHeading,
    sentenceHeadingText,
    type RefineOpen,
} from './SearchSentence';
import SearchTable from './SearchTable';
import type { DatasetDownloaded } from './useDatasetDownload';
import { useSearchRun } from './useSearchRun';

import Button from '@/components/atoms/Button/Button';
import DataPrompt from '@/components/molecules/DataPrompt/DataPrompt';
import StatTiles from '@/components/molecules/StatTiles/StatTiles';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import {
    catalogueChips,
    catalogueTiles,
    roundedCount,
    STARTING_POINT_QUERY,
    type SearchCatalogue,
} from '@/lib/search/catalogue';
import { localShortDateText } from '@/lib/sources/updateDates';
import { decodePermalinkState, encodePermalinkState } from '@/lib/search/permalink';
import { track } from '@/lib/events/client';
import {
    createSearchShare,
    createSuggestionSlot,
    fetchSearchShare,
    fetchVersionLink,
    type OpenedSearchShare,
    type SearchShareMode,
    type VersionLinkResult,
} from '@/lib/search/searchClient';
import { searchSharePart } from '@/lib/search/searchShareRequest';
import {
    downloadNote,
    noDataCardParts,
    progressSuffix,
    snapshotLiveNote,
    studioHandoffParts,
} from '@/lib/search/resultNotes';
import {
    HANDOFF_SOURCE_PARAM,
    handoffSource,
    searchEventProps,
    startSearchAction,
    type SearchSource,
} from '@/lib/search/searchEvents';
import { earlySentenceTokens, tokenPart } from '@/lib/search/sentencePlan';
import {
    handoffEdited,
    handoffQuestion,
    handoffSeeds,
    studioHref,
} from '@/lib/search/studioHandoff';
import {
    hasDefiniteSpec,
    isKnownPart,
    type ResolveResponse,
    type SentenceToken,
} from '@/lib/search/types';
import { parseVersionLink, type VersionLink, versionLinkHref } from '@/lib/search/versionLink';
import { observationsPendingText } from '@/lib/search/view';
import { writeSeeds } from '@/lib/studio/seedStore';

/** The early, pre-response heading's own tokens, read-only (see
 *  lib/search/sentencePlan.ts's earlySentenceTokens): the heading segment
 *  only, as the resolved <h1> draws it. A slot token is styled like
 *  SearchSentence's own slots but dashed and inert, UnresolvedToken's own
 *  look (`styles.slotMarked`), since nothing behind it is hydrated yet to
 *  hang a menu off. `data-part` echoes tokenPart's routing, the same one
 *  the resolved heading uses, and identifies the token without making it
 *  interactive. */
const EarlySentenceHeading = ({
    tokens,
    partCount,
}: {
    tokens: SentenceToken[];
    partCount: number;
}) => {
    return (
        <>
            {headingTokens(tokens).map((token, index) => {
                if (token.kind !== 'slot') {
                    return <span key={index}>{token.text}</span>;
                }

                if (!token.text.trim()) {
                    // An unbound placeholder, nothing to show yet.
                    return null;
                }

                return (
                    <span
                        key={index}
                        className={styles.slotMarked}
                        data-part={tokenPart(token, partCount) ?? undefined}
                    >
                        {token.text}
                    </span>
                );
            })}
        </>
    );
};

// `catalogue` is the search catalogue the page loaded on the server, or null
// when the API serves none: the idle chips, the stat tiles and the starting
// point read it.
/** What a visitor did with a search answer, sent as `search.action`. */
type SearchAction =
    | { action: 'pick_reading'; partIndex: number; specId: string }
    | ({ action: 'download'; partIndex: number } & DatasetDownloaded)
    | { action: 'share'; mode: SearchShareMode; shareId: string };

const DataSearch = ({ catalogue }: { catalogue: SearchCatalogue | null }) => {
    const router = useRouter();
    const searchParams = useSearchParams();
    // The URL is the state: `q` is the query text, `s` the permalink's
    // `{query, edits}` payload once the user has edited a part (see
    // lib/search/permalink). A refresh, or a pasted link, replays the same
    // view. The effect below writes it from the hook's own `query`/`edits`,
    // so every way in (prompt, edits, candidates) is covered.
    const startedRef = useRef<string | null>(null);
    // Set right before a permalink replay's own run starts; see the two
    // spots below that read/clear it.
    const suppressEmptyEditWriteRef = useRef(false);
    const {
        phase,
        query: runLabel,
        error,
        sharedSteps,
        partSteps,
        partSentencePlans,
        response,
        answer,
        parts,
        expectedParts,
        edits,
        unreadableSnapshots,
        optionsBySpec,
        entityOptionsBySpec,
        placeOptionsBySpec,
        run,
        showStartingPoint,
        reset,
        replay,
        openShare,
        editSlot,
        editEntity,
        editWindow,
        pickCandidate,
        editMeasure,
        editParsed,
        editShared,
        editFacet,
        searchIds,
    } = useSearchRun();
    // A version link runs with no question of its own: the resolved sentence
    // stands in for it wherever the page needs text (the Studio handoff, a
    // share, the permalink once the view is edited).
    const query = runLabel || (response ? sentenceHeadingText(response) : '');

    // Refine's one list and one open state: the heading's departures open it
    // at an entry, and the actions row's Refine button lists it.
    const refine = answerRefineItems({ response, parts, optionsBySpec, entityOptionsBySpec });
    const [refineOpen, setRefineOpen] = useState<RefineOpen | null>(null);

    const [suggestionSlot] = useState(createSuggestionSlot);

    // A query as text: the starting point's own question shows the catalogue
    // the page holds, with no search call, and records `search.start_point`.
    // Other text is a search, whose events useSearchRun sends. Every run
    // keeps only the live suggestion stream for the same text.
    const runQuery = useCallback(
        (text: string, source: SearchSource) => {
            suggestionSlot.keepOnly(text);
            if (text === STARTING_POINT_QUERY) {
                showStartingPoint(text, source);
            } else {
                run({ kind: 'raw_text', query: text }, text, source);
            }
        },
        [suggestionSlot, run, showStartingPoint],
    );

    // Latest `runQuery`/`replay`/`openShare`/`reset`, read (not watched) by the
    // permalink and share effects below, held through refs so their
    // dependency arrays stay free of them. `replay`'s identity changes when
    // reset() runs, and watching it made the effect re-fire on every reset,
    // whether or not the URL itself had changed. `run` and `openShare` are
    // stable today, built from a chain of empty-dependency useCallbacks, but
    // nothing enforces that stability. A later dependency added anywhere on
    // that chain could resurrect the re-fire bug, so all four are held
    // through refs.
    const runRef = useRef(runQuery);
    const replayRef = useRef(replay);
    const openShareRef = useRef(openShare);
    const resetRef = useRef(reset);
    useEffect(() => {
        runRef.current = runQuery;
        replayRef.current = replay;
        openShareRef.current = openShare;
        resetRef.current = reset;
    });

    // Bumped on reset — remounts DataPrompt, clearing its internal value.
    const [promptEpoch, setPromptEpoch] = useState(0);
    // A picked suggestion's text, injected into the remounted prompt.
    const [prefill, setPrefill] = useState('');
    // Set by Start New, so the remounted prompt takes focus and the reader
    // can type at once — and true on arrival too, so typing works without a
    // click (QA-12). Not on touch: there the caret summons the keyboard over
    // half the screen before anyone has read where they landed. Read on the
    // client only; the prompt focuses from an effect, so the server renders
    // the same markup either way.
    const [focusPrompt, setFocusPrompt] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches,
    );
    // Re-scan reveals when the view swaps (idle ⇄ result) or the prompt is
    // remounted — swapped-in DOM nodes the initial observer never saw.
    const sectionRef = useReveal<HTMLElement>(12, [phase, promptEpoch]);
    const [draft, setDraft] = useState('');
    const [suggest, setSuggest] = useState<ResolveResponse | null>(null);
    const [suggestPending, setSuggestPending] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    // The share link this view was opened from (?share=<id>), while the user
    // hasn't moved on from it: its snapshot date shows above the result, and
    // the URL keeps pointing at the link instead of being rewritten to ?q=.
    const [openedShare, setOpenedShare] = useState<OpenedSearchShare | null>(null);
    const openedShareRef = useRef<OpenedSearchShare | null>(null);
    // A version link the page could not open: unknown, expired or revoked
    // (`gone`), unreadable (`failed`), or a definition Search cannot replay
    // (`download_only`).
    const [linkRefusal, setLinkRefusal] = useState<{
        link: VersionLink;
        result: Exclude<VersionLinkResult, { kind: 'opened' }>;
    } | null>(null);
    const leaveShare = useCallback(() => {
        openedShareRef.current = null;
        setOpenedShare(null);
        setLinkRefusal(null);
    }, []);
    // Opens a share, or a link read as one, and keeps it as the view's
    // origin until the user moves on from it.
    const enterShare = useCallback((shared: OpenedSearchShare, source: SearchSource) => {
        openedShareRef.current = shared;
        setOpenedShare(shared);
        openShareRef.current(shared, source);
    }, []);

    const submitQuery = useCallback(
        (text: string, source: SearchSource) => {
            leaveShare();
            runQuery(text, source);
        },
        [runQuery, leaveShare],
    );

    // A link opens with no question of its own, so Retry reopens the share
    // or link the view still shows; retrying `query` would search for the
    // empty sentence and drop the link.
    const retry = useCallback(() => {
        if (openedShareRef.current) {
            enterShare(openedShareRef.current, 'retry');
        } else {
            submitQuery(query, 'retry');
        }
    }, [enterShare, submitQuery, query]);

    // What the answer on screen is, for the usage events.
    const answerKind = answer?.kind ?? 'resolution';
    const answerReason = answer?.kind === 'declined' ? answer.reason : null;

    // Every Studio action (a declined answer's, an operation_not_applied
    // departure's, the side panel's, a no_data part's callout) opens Studio
    // on the question, with a seed for each definite part, stored in this
    // tab's sessionStorage. When the seeds cannot be stored, Studio opens on
    // the question alone.
    const openStudio = useCallback(() => {
        const edited = handoffEdited({ editCount: edits.length, fromShare: openedShare !== null });
        const question = handoffQuestion({
            query,
            edited,
            sentence: sentenceHeadingText(response),
        });
        const seeds = handoffSeeds(parts);
        const token = writeSeeds(() => window.sessionStorage, seeds);
        const { searchId, traceId } = searchIds();

        track(
            'search.studio_handoff',
            searchEventProps({
                query,
                edited,
                kind: answerKind,
                reason: answerReason,
                parts,
                seeds: token ? seeds.length : 0,
                run: { ...(searchId && { searchId }), traceId },
            }),
        );
        router.push(studioHref(question, token));
    }, [
        router,
        query,
        edits.length,
        openedShare,
        response,
        parts,
        answerKind,
        answerReason,
        searchIds,
    ]);

    // A visitor's action on the answer on screen (docs/analytics.md): the
    // ids are read as the visitor acts, and the returned sender records it.
    const startAction = useCallback(
        () => startSearchAction<SearchAction>(searchIds, track, location.pathname),
        [searchIds],
    );

    // Live suggestions: a debounced background resolve renders interpretation
    // cards under the prompt while the user is still typing. It posts the
    // submit's own request (see createSuggestionSlot), so submitting the same
    // text can be served from the search API's response cache.
    const handleDraft = useCallback((value: string) => {
        setDraft(value);
        setSuggest(null);
        setSuggestPending(false);
    }, []);

    // Empties the prompt and drops its suggestions. A draft left over from a
    // submitted question would otherwise bring idle back in typing mode,
    // which hides a link refusal and asks for suggestions again.
    const clearPrompt = useCallback(() => {
        setDraft('');
        setPrefill('');
        setSuggest(null);
        setSuggestPending(false);
        setPromptEpoch((epoch) => epoch + 1);
    }, []);

    useEffect(() => {
        const text = draft.trim();

        // Other text supersedes the live suggestion. Leaving idle does not:
        // a submit of the same text is answered by that stream.
        suggestionSlot.keepOnly(text);

        if (phase !== 'idle' || text.length < 8) {
            return;
        }

        let current = true;
        const timer = window.setTimeout(() => {
            setSuggestPending(true);
            suggestionSlot
                .suggest(text)
                .then((body) => {
                    if (current) {
                        setSuggest(body);
                        setSuggestPending(false);
                    }
                })
                .catch(() => {
                    if (current) {
                        setSuggestPending(false);
                    }
                });
        }, 900);

        return () => {
            window.clearTimeout(timer);
            current = false;
        };
    }, [draft, phase, suggestionSlot]);

    useEffect(() => () => suggestionSlot.keepOnly(null), [suggestionSlot]);

    // A share link (/s/<id> lands here as ?share=<id>): load its references
    // and replay them — live, or over the snapshot's captured data.
    useEffect(() => {
        const id = searchParams.get('share');

        if (!id || startedRef.current === `share:${id}`) {
            return;
        }

        startedRef.current = `share:${id}`;

        void fetchSearchShare(id).then((shared) => {
            if (startedRef.current !== `share:${id}`) {
                return;
            }

            if (!shared) {
                startedRef.current = null;
                window.history.replaceState(null, '', '/data');

                return;
            }

            enterShare(shared, 'share');
        });
        // `openShare` is deliberately absent for the same reason `run` and
        // `replay` are off the permalink effect's array below: watching a
        // callback whose identity can change on reset() would re-open the
        // share after every reset.
    }, [searchParams, enterShare]);

    // A version link (?spec=<id>&v=<cv>, printed in every downloaded bundle,
    // or ?spec=<id> for the latest data): the Datasets API's own document
    // stands in for a share's stored references, and the view opens like a
    // share (see lib/search/versionLink).
    useEffect(() => {
        const link = parseVersionLink(searchParams);

        if (!link) {
            return;
        }

        const key = `spec:${versionLinkHref(link)}`;

        if (startedRef.current === key) {
            return;
        }

        startedRef.current = key;
        // Opening a link starts a new run: the previous one goes now, its
        // submitted question included, so a refusal shows on the idle view
        // with nothing stale beside it.
        leaveShare();
        resetRef.current();
        clearPrompt();

        void fetchVersionLink(link).then((result) => {
            if (startedRef.current !== key) {
                return;
            }

            if (result.kind === 'opened') {
                enterShare(result.shared, 'version_link');
            } else {
                setLinkRefusal({ link, result });
            }
        });
    }, [searchParams, enterShare, leaveShare, clearPrompt]);

    // The latest data for a link's dataset, under its own ?spec= link. An
    // opened link already holds the identity and replays it live, its key
    // marked started so the link effect does not read the dataset again; a
    // refused one is read afresh by that effect once the URL moves.
    const openLatest = useCallback(
        (shared: OpenedSearchShare | null, link: VersionLink) => {
            const latest = { specId: link.specId, contentVersion: null };
            const href = versionLinkHref(latest);

            setLinkRefusal(null);

            if (shared) {
                startedRef.current = `spec:${href}`;
                enterShare({ ...shared, mode: 'live', link: latest }, 'version_link');
            }

            window.history.replaceState(null, '', href);
        },
        [enterShare],
    );

    // Permalink / homepage handoff: ?q= (and ?s=) auto-runs once per value.
    // The homepage prompt adds `via` (typed or example). It is read here and
    // stripped at once, so the address bar never offers it for copying and a
    // pasted link records `permalink`.
    useEffect(() => {
        const q = searchParams.get('q');
        const s = searchParams.get('s') ?? '';
        const key = `${q}|${s}`;

        if (!q || startedRef.current === key) {
            return;
        }

        startedRef.current = key;

        const source = handoffSource(searchParams.get(HANDOFF_SOURCE_PARAM));

        if (searchParams.has(HANDOFF_SOURCE_PARAM)) {
            const rest = new URLSearchParams(searchParams);

            rest.delete(HANDOFF_SOURCE_PARAM);
            window.history.replaceState(null, '', `/data?${rest}`);
        }

        if (!s) {
            runRef.current(q, source);

            return;
        }

        // No cleanup cancel here: Strict Mode runs the effect twice, and the
        // ref guard makes the second pass a no-op — a cancel would leave the
        // first (only) decode dead. A newer key superseding this one is
        // enough of a guard.
        void decodePermalinkState(s).then((state) => {
            if (startedRef.current !== key) {
                return;
            }

            // A link whose edits can't be read falls back to the text.
            if (state) {
                // replay() clears `edits` back to [] the instant its own run
                // starts, then repopulates them one resubmit at a time. The
                // URL-sync effect below must not read that transient empty
                // state as "no edits" and strip `s=` before they land.
                suppressEmptyEditWriteRef.current = true;
                replayRef.current(state, source);
            } else {
                runRef.current(q, source);
            }
        });
        // `run` and `replay` are deliberately absent. Watching either would
        // re-fire this effect on internal state that reset() touches,
        // instead of only on a genuine URL change.
    }, [searchParams]);

    // Mirrors the run's own `query`/`edits` into the URL, derived rather
    // than fired per-edit. Two branches, matching the shapes `?s=` actually
    // carries: no edits yet (`?q=` alone, key `${query}|`), or the encoded
    // `{query, edits}` payload once at least one part has been edited.
    // Every URL write on this page goes through `history.replaceState`,
    // which the App Router mirrors into `useSearchParams`: /data renders per
    // request, so a `router.replace` would cost a server render per write.
    useEffect(() => {
        if (phase === 'idle') {
            return;
        }

        // Still exactly what the share link shows: leave the URL on the link.
        // The first edit makes it the user's own view, with its own URL.
        if (openedShareRef.current) {
            if (edits.length === 0) {
                return;
            }

            openedShareRef.current = null;
        }

        if (edits.length === 0) {
            // A replay's own edits haven't landed yet. Each one resolves as
            // its own part-targeted op, independent of the run-level `phase`
            // above (which flips to 'done' once the base query alone
            // settles). Wait for every part's own phase to leave 'loading'
            // too, or an edit still in flight gets read as "no edits" and
            // strips the `s=` this navigation started from. On the render
            // right after `replay()` starts, `parts` is still empty (the
            // base run's own `response`/`interpretation` hasn't landed), so
            // `.some()` below is vacuously false. Treat "no parts known yet
            // while a replay is in progress" as loading too, or this effect
            // strips `s=` before any edit gets the chance to replay. A
            // catalogue or declined answer has no parts and never will, so
            // it counts as settled.
            const anyPartLoading =
                (parts.length === 0 && !answer) || parts.some((part) => part.phase === 'loading');

            if (suppressEmptyEditWriteRef.current && anyPartLoading) {
                return;
            }

            // Reached only once parts are known and none are still loading.
            // By then every replayed edit that was going to land already has
            // (each part's `response` handler records its edit before that
            // part's own `done`), so it's safe to treat a still-empty
            // `edits` as "no edits" instead of "not landed yet".
            suppressEmptyEditWriteRef.current = false;

            const key = `${query}|`;

            if (startedRef.current === key) {
                return;
            }

            startedRef.current = key;
            window.history.replaceState(null, '', `/data?q=${encodeURIComponent(query)}`);

            return;
        }

        suppressEmptyEditWriteRef.current = false;

        let cancelled = false;

        void encodePermalinkState({ query, edits }).then((encoded) => {
            if (cancelled) {
                return;
            }

            const key = `${query}|${encoded}`;

            if (startedRef.current === key) {
                return;
            }

            startedRef.current = key;
            window.history.replaceState(
                null,
                '',
                `/data?q=${encodeURIComponent(query)}&s=${encoded}`,
            );
        });

        return () => {
            cancelled = true;
        };
    }, [phase, query, edits, parts, answer]);

    // Read, not watched: startNew's identity changes with reset(), and
    // watching it would re-run the effect below on internal state.
    const startNewRef = useRef<() => void>(() => {});

    const startNew = useCallback(() => {
        leaveShare();
        reset();
        // The typing-mode trio must clear too, or idle comes back raised, with
        // the Try row hidden and the previous suggestions still on screen.
        clearPrompt();
        // Clears the permalink effect's "already started this key" guard, so
        // a genuine later navigation back to the same `?q=` (browser back, a
        // re-pasted link, a saved permalink) re-triggers the resolve instead
        // of being silently skipped as a stale key.
        startedRef.current = null;
        setFocusPrompt(true);
        window.history.replaceState(null, '', '/data');
    }, [reset, leaveShare, clearPrompt]);

    useEffect(() => {
        startNewRef.current = startNew;
    });

    // Get Data in the header navigates to a bare /data, which empties the
    // query string but leaves this component mounted — so the old result sat
    // there under a clean URL with no obvious way out (QA-30). A query string
    // going from something to nothing is that navigation, and the answer is
    // the one Start New gives.
    //
    // The transition is what matters, not the emptiness: between submitting a
    // query and the URL being rewritten there is a moment with a run in
    // flight and no parameters yet, and reading that as "navigated away"
    // would kill the search the reader just started. Our own writes that
    // clear the URL all reset first, so `phase` is already idle by the time
    // they are seen here.
    const prevSearchRef = useRef(searchParams.toString());

    useEffect(() => {
        const search = searchParams.toString();
        const left = prevSearchRef.current;

        prevSearchRef.current = search;

        if (search === '' && left !== '' && phase !== 'idle') {
            startNewRef.current();
        }
    }, [searchParams, phase]);

    // Picking a card fills the prompt with its phrasing. The engine runs
    // only when the user submits it, and from a result screen this steps
    // back to idle first.
    const applySuggestion = useCallback(
        (text?: string) => {
            // Card phrasings are stitched from plan tokens — empty slots leave
            // doubled spaces (even stray newlines) that would then wrap the
            // prompt's textarea mid-sentence.
            const value = (text ?? '').replace(/\s+/g, ' ').trim();

            if (!value) {
                return;
            }

            if (phase !== 'idle') {
                leaveShare();
                reset();
                startedRef.current = null;
                window.history.replaceState(null, '', '/data');
            }

            setDraft(value);
            setPrefill(value);
            setSuggest(null);
            setSuggestPending(false);
            setPromptEpoch((epoch) => epoch + 1);
        },
        [phase, reset, leaveShare],
    );

    const shareView = useCallback(async () => {
        const url =
            edits.length > 0
                ? `${location.origin}/data?q=${encodeURIComponent(query)}&s=${await encodePermalinkState({ query, edits })}`
                : `${location.origin}/data?q=${encodeURIComponent(query)}`;

        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
        window.setTimeout(() => setLinkCopied(false), 2000);
    }, [query, edits]);

    const typing = draft.trim().length > 0;
    const refusalVersion = linkRefusal?.link.contentVersion;
    const refusalText = !linkRefusal
        ? null
        : linkRefusal.result.kind === 'download_only'
          ? refusalVersion
              ? "This version of the dataset can't be opened on the site."
              : "This dataset can't be opened on the site."
          : linkRefusal.result.kind === 'failed'
            ? 'This dataset could not be loaded.'
            : refusalVersion
              ? 'This version of the dataset is no longer available.'
              : 'This dataset is not available.';
    const tiles = catalogueTiles(catalogue);

    // The one preview table's rows: every definite part, in part order, spec
    // deduped by spec_id (a folded part shares its representative's spec_id
    // and would otherwise double its rows — the composed plan already drops
    // a folded part from the heading/variable lines the same way).
    const seenSpecIds = new Set<string>();
    const definiteParts = parts.filter(hasDefiniteSpec).filter((part) => {
        const specId = part.hydratedSpec.spec_id;

        if (seenSpecIds.has(specId)) {
            return false;
        }

        seenSpecIds.add(specId);

        return true;
    });
    // True while any definite part's observations are still streaming in
    // (the base run still loading, or an edit post in flight). The preview
    // table shows its pending line instead of the omission copy while that
    // window is open.
    const observationsPending = definiteParts.some((part) => part.observationsPending);
    const liveNote = snapshotLiveNote(
        definiteParts.map((part) => ({
            specId: part.hydratedSpec.spec_id,
            name: part.variableText ?? part.hydratedSpec.shape?.label ?? '—',
        })),
        unreadableSnapshots,
    );

    // Share: a link for the definite parts on screen (every one, in part
    // order — a folded part keeps its own position). No numbers leave the
    // page; the server stores the datasets they resolved to.
    const sharedParts = parts.filter(hasDefiniteSpec);
    const sharedDatasets = sharedParts.map((part) => ({
        partIndex: part.index,
        specId: part.hydratedSpec.spec_id,
        label: part.variableText ?? part.hydratedSpec.shape?.label ?? '—',
    }));
    const createShare: CreateSearchShare = (mode) => {
        const sendAction = startAction();

        return createSearchShare({
            mode,
            query,
            parts: sharedParts.map(searchSharePart),
        }).then((result) => {
            if (!('id' in result)) {
                return result;
            }

            sendAction({ action: 'share', mode, shareId: result.id });

            return { ...result, datasets: sharedDatasets };
        });
    };
    // A part whose question asked for more than search does carries an
    // operation_not_applied departure, whose action hands it to Studio;
    // without one, the side panel offers Studio itself, so a page shows one
    // Studio prompt.
    const studioDeparture = parts.some((part) =>
        (part.part?.departures ?? []).some(
            (departure) => departure.code === 'operation_not_applied',
        ),
    );

    // A part with a slot token gets SearchSentence's own inline menu or
    // picker. Only a part without one renders below the sentence.
    const rawPlan = response?.sentence_plan ?? [];
    const isSlotted = (index: number) =>
        rawPlan.some((token) => token.kind === 'slot' && tokenPart(token, parts.length) === index);
    const candidatesParts = parts.flatMap((hydrated) => {
        const { part } = hydrated;

        return part && isKnownPart(part) && part.status === 'candidates'
            ? [{ ...hydrated, part }]
            : [];
    });

    // Collapses to the first no_data part whose callout is the generic
    // 'studio' hand-off panel (identical text per part). Flagged/alternate
    // callouts and an ambiguous part's own picker still render once each.
    const noDataPartsToRender = studioHandoffParts(noDataCardParts(parts, isSlotted), query);

    const unsupportedPartsToRender = parts.filter(
        (part) => part.part?.status === 'unsupported' && !isSlotted(part.index),
    );

    // The loading heading: the user's own words until the first part's
    // `sentence` event, then the parts that have one, in part order (see
    // earlySentenceTokens). A part refused before its sentence is left out
    // until the response replaces the heading.
    const earlyTokens = earlySentenceTokens(expectedParts.length, partSentencePlans);
    const loadingHeading = query || 'Resolving…';
    // The early heading's own rendered text, so the resolved heading below
    // can tell which of its tokens are genuinely new (see
    // SearchSentenceHeading's newTokenTexts).
    const earlyHeadingTexts = earlyTokens
        ? new Set(
              headingTokens(earlyTokens)
                  .map((token) => token.text.trim())
                  .filter(Boolean),
          )
        : undefined;
    // "N of M parts resolved" for 2+ parts. A single part shows a reader
    // phrase for its own latest step instead, since that's where its real
    // latency lives.
    const loadingProgress = progressSuffix(sharedSteps, partSteps, expectedParts.length);

    return (
        <section ref={sectionRef} className={styles.section} data-nav-dark="true">
            {phase === 'idle' && (
                <div className={styles.idle} data-typing={typing || undefined}>
                    <div className={styles.idlePrompt}>
                        <p className={styles.queryLabel} aria-hidden={!typing}>
                            Your Query
                        </p>
                        <DataPrompt
                            key={promptEpoch}
                            initial={prefill}
                            suggestions={catalogueChips(catalogue)}
                            suggestionsHidden={typing}
                            onSubmit={submitQuery}
                            onChange={handleDraft}
                            autoFocus={focusPrompt}
                        />
                        {linkRefusal && !typing && (
                            <p className={styles.linkRefusal} role="alert">
                                {refusalText}
                                {linkRefusal.result.kind === 'download_only'
                                    ? linkRefusal.result.download && (
                                          <a
                                              className={styles.shareLatest}
                                              href={linkRefusal.result.download.href}
                                              download
                                          >
                                              Download it (
                                              {linkRefusal.result.download.format.toUpperCase()})
                                          </a>
                                      )
                                    : linkRefusal.link.contentVersion && (
                                          <button
                                              type="button"
                                              className={styles.shareLatest}
                                              onClick={() => openLatest(null, linkRefusal.link)}
                                          >
                                              Open the latest data
                                          </button>
                                      )}
                            </p>
                        )}
                        {typing && (
                            <div className={styles.idleActions}>
                                <Button variant="outline" onClick={startNew}>
                                    Start New
                                </Button>
                            </div>
                        )}
                    </div>
                    {typing ? (
                        <div className={classNames(styles.idleBottom, styles.idleBottomTyping)}>
                            {suggestPending && (
                                <p className={styles.stepsLine} aria-live="polite">
                                    Generating suggestions…
                                </p>
                            )}
                            {suggest && (
                                <SearchCards
                                    part={
                                        suggest.kind === 'resolution'
                                            ? (suggest.parts[0] ?? null)
                                            : null
                                    }
                                    onPick={applySuggestion}
                                />
                            )}
                        </div>
                    ) : (
                        <div className={styles.idleBottom} data-reveal-group="trigger">
                            <div className={styles.buildBox} data-reveal style={revealIndex(0)}>
                                <h2 className={styles.buildTitle}>Build a Dataset</h2>
                                <p className={styles.buildText}>
                                    Describe the data you need, tune the parameters, and export a
                                    structured dataset drawn from{' '}
                                    {catalogue &&
                                        `${roundedCount(catalogue.counts.indicators)} indicators in `}
                                    the DFO knowledge graph.
                                </p>
                            </div>
                            {tiles.length > 0 && <StatTiles stats={tiles} />}
                        </div>
                    )}
                </div>
            )}

            {phase === 'error' && (
                <div className={styles.result}>
                    <div className={classNames(styles.hero, styles.heroBare)}>
                        <div className={styles.heroMain}>
                            <p className={styles.eyebrow}>Your Query</p>
                            <h1 className={styles.query}>{query}</h1>
                            <p className={styles.errorLine}>{error}</p>
                            <div className={styles.actions}>
                                <Button variant="outline" onClick={retry}>
                                    Retry
                                </Button>
                                <Button variant="outline" onClick={startNew}>
                                    Start New
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {(phase === 'loading' || phase === 'done') && (
                <div className={styles.result}>
                    {phase === 'done' && (
                        <div className={styles.resultToolbar}>
                            {/* Only while the view is still the link's own: an
                                edit turns it into live data. */}
                            {openedShare?.mode === 'snapshot' &&
                                edits.length === 0 &&
                                (liveNote?.allLive ? (
                                    <p className={styles.shareNote} role="status">
                                        {liveNote.text}
                                    </p>
                                ) : (
                                    <p className={styles.shareNote}>
                                        Snapshot · data as of{' '}
                                        {localShortDateText(new Date(openedShare.createdAt))}
                                        <button
                                            type="button"
                                            className={styles.shareLatest}
                                            onClick={() => {
                                                // The same datasets, replayed live.
                                                if (openedShare.link) {
                                                    openLatest(openedShare, openedShare.link);

                                                    return;
                                                }

                                                leaveShare();
                                                openShare(
                                                    { ...openedShare, mode: 'live' },
                                                    'share',
                                                );
                                            }}
                                        >
                                            View latest
                                        </button>
                                        {liveNote && <span role="status"> · {liveNote.text}</span>}
                                    </p>
                                ))}
                            {/* A single dataset shares from its side panel;
                                several get the same box in a dialog, and a
                                result with none (no data, unresolved) can
                                still pass its question around. */}
                            {definiteParts.length !== 1 && (
                                <Button
                                    variant="outline"
                                    onClick={
                                        sharedParts.length > 0
                                            ? () => setShareOpen(true)
                                            : shareView
                                    }
                                >
                                    {linkCopied ? 'Link Copied' : 'Share'}
                                </Button>
                            )}
                        </div>
                    )}

                    {answer ? (
                        // A catalogue or declined answer: no parts, no
                        // dataset, the query as the heading.
                        <div className={classNames(styles.hero, styles.heroBare)}>
                            <div className={styles.heroMain}>
                                <p className={styles.eyebrow}>Your Query</p>
                                <h1 className={styles.query}>{query}</h1>
                                <SearchAnswer
                                    answer={answer}
                                    catalogue={catalogue}
                                    onRun={(text) => submitQuery(text, 'example')}
                                    onStartNew={startNew}
                                    onShowCatalogue={() =>
                                        submitQuery(STARTING_POINT_QUERY, 'catalogue')
                                    }
                                    onStudio={openStudio}
                                />
                            </div>
                        </div>
                    ) : (
                        // One shell, mounted continuously from the first loading
                        // frame through the resolved result: the eyebrow and
                        // SearchSentenceHeading's <h1> never unmount across that
                        // transition, only their content does, so the
                        // heading's entrance animation (DataSearch.module.scss's
                        // `.sentence` rise-in) never replays partway through.
                        // See SearchSentenceHeading's own doc comment.
                        <div
                            className={classNames(
                                styles.hero,
                                (!response || definiteParts.length !== 1) && styles.heroBare,
                            )}
                        >
                            <div className={styles.heroMain}>
                                <p className={styles.eyebrow}>
                                    {!response ||
                                    response.status === 'no_data' ||
                                    response.status === 'unsupported'
                                        ? 'Your Query'
                                        : 'Your Dataset'}
                                </p>

                                {/* Only where there is something to tap:
                                    a resolved part is what puts the
                                    editable tokens in the heading. */}
                                {definiteParts.length > 0 && <SearchHint />}

                                <SearchSentenceHeading
                                    response={response}
                                    parts={parts}
                                    optionsBySpec={optionsBySpec}
                                    entityOptionsBySpec={entityOptionsBySpec}
                                    placeOptionsBySpec={placeOptionsBySpec}
                                    baseStreamOpen={phase === 'loading'}
                                    onEditSlot={editSlot}
                                    onEditEntity={editEntity}
                                    onEditWindow={editWindow}
                                    onEditMeasure={editMeasure}
                                    onEditFacet={editFacet}
                                    onEditParsed={editParsed}
                                    onEditShared={editShared}
                                    onRefine={(text) => submitQuery(text, 'refine')}
                                    onStudio={openStudio}
                                    refine={refine}
                                    onRefineOpen={setRefineOpen}
                                    fallback={
                                        earlyTokens ? (
                                            <EarlySentenceHeading
                                                tokens={earlyTokens}
                                                partCount={expectedParts.length}
                                            />
                                        ) : (
                                            loadingHeading
                                        )
                                    }
                                    newTokenTexts={earlyHeadingTexts}
                                />

                                {!response ? (
                                    <>
                                        <p className={styles.stepsLine} aria-live="polite">
                                            Resolving
                                            {loadingProgress && ` — ${loadingProgress}`}…
                                        </p>
                                        <p className={styles.resultsEmpty}>
                                            {observationsPendingText}
                                        </p>
                                    </>
                                ) : (
                                    <SearchSentenceBody
                                        parts={parts}
                                        optionsBySpec={optionsBySpec}
                                        onEditSlot={editSlot}
                                        onEditEntity={editEntity}
                                        onEditFacet={editFacet}
                                        onStartNew={startNew}
                                        refine={refine}
                                        optionsPending={
                                            phase === 'loading' ||
                                            parts.some((part) => part.phase === 'loading')
                                        }
                                        refineOpen={refineOpen}
                                        onRefineOpenChange={setRefineOpen}
                                    />
                                )}
                            </div>
                            {response && definiteParts.length === 1 && (
                                <SearchPanel
                                    spec={definiteParts[0].hydratedSpec}
                                    note={downloadNote(definiteParts[0].part?.warnings)}
                                    createShare={createShare}
                                    onStudio={studioDeparture ? undefined : openStudio}
                                    onDownloadStart={() => {
                                        const sendAction = startAction();
                                        const partIndex = definiteParts[0].index;

                                        return (downloaded) =>
                                            sendAction({
                                                action: 'download',
                                                partIndex,
                                                ...downloaded,
                                            });
                                    }}
                                />
                            )}
                        </div>
                    )}

                    {response && (
                        <>
                            {[...noDataPartsToRender, ...unsupportedPartsToRender].map((part) => (
                                <SearchCards
                                    key={part.index}
                                    part={part.part}
                                    partIndex={part.index}
                                    onPick={applySuggestion}
                                    onEditParsed={editParsed}
                                    onStudio={openStudio}
                                    question={query}
                                />
                            ))}

                            {candidatesParts.map((part) => (
                                <ReadingCards
                                    key={part.index}
                                    part={part.part}
                                    prefix={parts.length > 1 ? part.variableText : null}
                                    onPick={(spec) => {
                                        startAction()({
                                            action: 'pick_reading',
                                            partIndex: part.index,
                                            specId: spec.spec_id,
                                        });
                                        pickCandidate(part.index, spec);
                                    }}
                                    onRetry={() => submitQuery(query, 'retry')}
                                />
                            ))}

                            {definiteParts.length > 0 && (
                                <SearchTable
                                    parts={definiteParts.map((part) => ({
                                        index: part.index,
                                        variableText: part.variableText,
                                        spec: part.hydratedSpec,
                                        warnings: part.part?.warnings,
                                    }))}
                                    observationsPending={observationsPending}
                                />
                            )}
                        </>
                    )}
                </div>
            )}

            {shareOpen && (
                <SearchShareModal
                    open={shareOpen}
                    onOpenChange={setShareOpen}
                    createShare={createShare}
                />
            )}
        </section>
    );
};

export default DataSearch;
