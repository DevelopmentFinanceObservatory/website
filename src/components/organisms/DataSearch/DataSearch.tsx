'use client';

import classNames from 'classnames';
// router.prefetch takes its kind only as this enum, which next/navigation
// does not export.
import { PrefetchKind } from 'next/dist/client/components/router-reducer/router-reducer-types';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    useCallback,
    useDeferredValue,
    useEffect,
    useEffectEvent,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';

import styles from './DataSearch.module.scss';
import ReadingCards from './ReadingCards';
import SearchAnswer from './SearchAnswer';
import SearchHint from './SearchHint';
import SearchCards from './SearchCards';
import SearchPanel from './SearchPanel';
import SearchShareModal from './SearchShareModal';
import type { CreateSearchShare } from './SearchShare';
import {
    answerPlan,
    answerRefineItems,
    headingTokens,
    SearchSentenceBody,
    SearchSentenceHeading,
    sentenceHeadingText,
    type RefineOpen,
} from './SearchSentence';
import SearchTable from './SearchTable';
import StudioMove from './StudioMove';
import StudioOffer from './StudioOffer';
import type { DatasetDownloaded } from './useDatasetDownload';
import { type RunRoute, useSearchRun } from './useSearchRun';
import type { ChangeAction } from './WhyPanel';

import Button from '@/components/atoms/Button/Button';
import DataPrompt from '@/components/molecules/DataPrompt/DataPrompt';
import StatTiles from '@/components/molecules/StatTiles/StatTiles';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import {
    catalogueChips,
    catalogueTiles,
    STARTING_POINT_QUERY,
    type SearchCatalogue,
} from '@/lib/search/catalogue';
import { localShortDateText } from '@/lib/sources/updateDates';
import { decodePermalinkState, encodePermalinkState } from '@/lib/search/permalink';
import { track } from '@/lib/events/client';
import { shareCopyProps } from '@/lib/events/shareCopy';
import {
    createSearchShare,
    fetchSearchShare,
    fetchVersionLink,
    type OpenedSearchShare,
    type SearchShareMode,
    type VersionLinkResult,
} from '@/lib/search/searchClient';
import { searchSharePart } from '@/lib/search/searchShareRequest';
import { REFINE_ANCHOR, revealThenOpen, tokenAnchor } from '@/lib/search/menuReveal';
import { changeTarget, sameMenuChanges, type MenuChanges } from '@/lib/search/refineMenu';
import {
    downloadNote,
    noDataCardParts,
    progressSuffix,
    snapshotLiveNote,
    studioHandoffParts,
} from '@/lib/search/resultNotes';
import {
    dataSearchHref,
    HANDOFF_ROUTING_PARAM,
    handoffArrival,
    moveBackHref,
    routingOffFor,
    searchEventProps,
    startSearchAction,
    type SearchSource,
} from '@/lib/search/searchEvents';
import { earlySentenceTokens, tokenPart } from '@/lib/search/sentencePlan';
import {
    handoffEdited,
    handoffFromExample,
    handoffQuestion,
    handoffSeeds,
    handoffVia,
    ROUTE_TO_STUDIO,
    studioHref,
    type HandoffTrigger,
} from '@/lib/search/studioHandoff';
import { optsIntoStudioRouting } from '@/lib/search/studioRoutingSetting';
import {
    clickLeavesPage,
    guestPromptsSeen,
    routeMove,
    type RouteStayTrigger,
} from '@/lib/search/studioRoute';
import { hasDefiniteSpec, isKnownPart, type SentenceToken } from '@/lib/search/types';
import { parseVersionLink, type VersionLink, versionLinkHref } from '@/lib/search/versionLink';
import { observationsPendingText } from '@/lib/search/view';
import { guestOutOfPrompts } from '@/lib/studio/promptAllowance';
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

// Studio's guest prompt count lives in localStorage. Another tab's Studio
// changes it through the `storage` event.
const subscribeStorage = (listener: () => void) => {
    window.addEventListener('storage', listener);

    return () => window.removeEventListener('storage', listener);
};

// How long the automatic move holds its callout before Studio opens: the
// time to read it, and the window in which the reader can stay. It starts
// again in full when the pointer or focus leaves the callout.
const MOVE_PAUSE_MS = 600;

// Whether the address bar keeps the Studio router off for `query`.
const routingOffHere = (query: string): boolean =>
    routingOffFor(new URLSearchParams(window.location.search), query);

const DataSearch = ({
    catalogue,
    guest,
    studioRouting,
}: {
    catalogue: SearchCatalogue | null;
    // The server's STUDIO_ROUTING_ENABLED setting. Off, no run sends
    // `studio_routing`, so the search API never routes.
    studioRouting: boolean;
    // True when signed out. Studio answers a guest only while a free prompt
    // is left.
    guest: boolean;
}) => {
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
        route,
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
        searchIsExample,
    } = useSearchRun();
    // A version link runs with no question of its own: the resolved sentence
    // stands in for it wherever the page needs text (the Studio handoff, a
    // share, the permalink once the view is edited).
    const query = runLabel || (response ? sentenceHeadingText(response) : '');

    // Refine's one list and one open state: the heading's departures open it
    // at an entry, and the actions row's Refine button lists it.
    const refine = answerRefineItems({ response, parts, optionsBySpec, entityOptionsBySpec });
    const [refineOpen, setRefineOpen] = useState<RefineOpen | null>(null);

    // The heading's open token menu, and the menus it last drew with the
    // refs each can change, so a fact's Change in "About this answer"
    // opens the same menu a departure would (changeTarget).
    const [openMenu, setOpenMenu] = useState<number | null>(null);
    const [menuChanges, setMenuChanges] = useState<MenuChanges>(() => new Map());
    const reportMenuChanges = useCallback(
        (next: MenuChanges) =>
            setMenuChanges((current) => (sameMenuChanges(current, next) ? current : next)),
        [],
    );
    // A Change scrolls the menu's trigger into view before the menu opens
    // (revealThenOpen). Each Change, a new answer, and unmounting abort the
    // wait, so a stale Change never opens a menu.
    const reducedMotion = usePrefersReducedMotion();
    const revealRef = useRef<AbortController | null>(null);
    useEffect(() => () => revealRef.current?.abort(), [response]);
    const reveal = (anchorKey: string, open: () => void) => {
        revealRef.current?.abort();
        const controller = new AbortController();
        revealRef.current = controller;
        revealThenOpen(anchorKey, open, { signal: controller.signal, reduced: reducedMotion });
    };
    const changeAction: ChangeAction = (partIndex, bindingRef) => {
        const target = changeTarget({
            plan: answerPlan({ response, parts }),
            partCount: parts.length,
            partIndex,
            bindingRef,
            menuChanges,
            refineKeys: new Set(refine.map((item) => item.key)),
        });

        if (target?.kind === 'token') {
            return () => reveal(tokenAnchor(target.index), () => setOpenMenu(target.index));
        }

        if (target?.kind === 'refine') {
            return () => reveal(REFINE_ANCHOR, () => setRefineOpen({ at: target.key }));
        }

        return null;
    };

    // A query as text: the starting point's own question shows the catalogue
    // the page holds, with no search call, and records `search.start_point`.
    // Other text is a search, whose events useSearchRun sends, opted in to
    // the search API's Studio router while the `studioRouting` prop
    // (STUDIO_ROUTING_ENABLED) is on, unless the URL holds `routing=off` for
    // the same text (routingOffFor): Studio's way back, the entry an
    // automatic move leaves, a stay on the data search, and a retry or edit
    // of any of them.
    const runQuery = useCallback(
        (text: string, source: SearchSource) => {
            if (text === STARTING_POINT_QUERY) {
                showStartingPoint(text, source);
            } else {
                run({ kind: 'raw_text', query: text }, text, source, {
                    studioRouting: optsIntoStudioRouting({
                        enabled: studioRouting,
                        routingOff: routingOffHere(text),
                    }),
                });
            }
        },
        [run, showStartingPoint, studioRouting],
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
    // The route of a move the reader stayed out of during its pause (Escape
    // or the callout's button), kept as an offer while the page searches the
    // same question as data. Only that search shows it. The out-of-prompts
    // card's data action keeps none, since its Studio card would lead a
    // guest with no free prompt left to Studio's refusal. Every other
    // search, Start New and an opened share or link drop it.
    const [stayed, setStayed] = useState<{ query: string; route: RunRoute } | null>(null);
    const leaveShare = useCallback(() => {
        openedShareRef.current = null;
        setOpenedShare(null);
        setLinkRefusal(null);
    }, []);
    // Opens a share, or a link read as one, and keeps it as the view's
    // origin until the user moves on from it.
    const enterShare = useCallback((shared: OpenedSearchShare, source: SearchSource) => {
        setStayed(null);
        openedShareRef.current = shared;
        setOpenedShare(shared);
        openShareRef.current(shared, source);
    }, []);

    // The page opened on a URL with the Studio router off (`routing=off`:
    // Studio's way back, Back to the entry a move leaves, a reload or a
    // copied link), whose heading is in place as the page arrives, with no
    // rise. The reader's next search rises as any other. A URL write on the
    // mounted page changes nothing here.
    const [arrivedRouteOff, setArrivedRouteOff] = useState(
        () => searchParams.get(HANDOFF_ROUTING_PARAM) === 'off',
    );

    const submitQuery = useCallback(
        (text: string, source: SearchSource) => {
            leaveShare();
            setStayed(null);
            setArrivedRouteOff(false);
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

    // The search API's Studio route for this run: `auto` moves the reader
    // to Studio once the run is done, and `offer` shows the Studio card. A
    // guest with no free prompt left is offered Studio instead of moved,
    // on a card that also searches the question as data (`out_of_prompts`).
    const guestUsed = useSyncExternalStore(
        subscribeStorage,
        () => guestPromptsSeen({ guest, storage: () => window.localStorage }),
        () => 0,
    );
    const move = routeMove({
        route,
        kind: answer?.kind ?? (response ? 'resolution' : null),
        guestOutOfPrompts: guestOutOfPrompts({ guest, used: guestUsed }),
    });
    const stayedRoute = stayed?.query === query ? stayed.route : null;
    // The route a click on the Studio card hands over: the run's own offer,
    // or the move the reader stayed out of.
    const offerRoute = move === 'offer' || move === 'out_of_prompts' ? route : stayedRoute;
    // The Studio card stands in for every other Studio action on the
    // answer, from the route's early frame on.
    const studioOffered = offerRoute !== null;
    // A requires_analysis decline under the run's own Studio card shows one
    // callout, the decline's, which carries the card's actions.
    const declineOffers =
        studioOffered &&
        !stayedRoute &&
        answer?.kind === 'declined' &&
        answer.reason === 'requires_analysis';

    // Every Studio action (a declined answer's, an operation_not_applied
    // departure's, the side panel's, a no_data part's callout, the route's
    // offer card, the route's automatic move) opens Studio on the question,
    // with a seed for each definite part, stored in this tab's
    // sessionStorage. When the seeds cannot be stored, Studio opens on the
    // question alone. `studioHandoff` stores the seeds and makes Studio's
    // URL, and its `go` records the handoff and opens Studio as a new
    // history entry with the route-to-studio transition type, so Studio
    // slides in over the page. The automatic move opens it once the entry
    // it leaves holds the question's `routing=off` URL (the move's effect
    // below). A routed handoff carries the trace id of the route's early
    // frame, or of the answer when the frame carried none.
    const studioHandoff = useCallback(
        (trigger: HandoffTrigger, routed: RunRoute | null = null) => {
            const edited = handoffEdited({
                editCount: edits.length,
                fromShare: openedShare !== null,
            });
            const question = handoffQuestion({
                query,
                edited,
                sentence: sentenceHeadingText(response),
            });
            const seeds = handoffSeeds(parts);
            const token = writeSeeds(() => window.sessionStorage, seeds);
            const ids = searchIds();
            const { searchId } = ids;
            const traceId = routed?.traceId ?? ids.traceId;
            const fromExample = handoffFromExample({ fromExample: searchIsExample(), edited });
            const href = studioHref(question, token, {
                via: handoffVia({ trigger, fromExample }),
                traceId,
                fromExample,
            });

            return {
                href,
                go: () => {
                    track(
                        'search.studio_handoff',
                        searchEventProps({
                            query,
                            edited,
                            kind: answerKind,
                            reason: answerReason,
                            parts,
                            seeds: token ? seeds.length : 0,
                            trigger,
                            ...(routed && { probability: routed.probability }),
                            run: { ...(searchId && { searchId }), traceId },
                        }),
                    );
                    router.push(href, { transitionTypes: [ROUTE_TO_STUDIO] });
                },
            };
        },
        [
            router,
            query,
            edits.length,
            openedShare,
            response,
            parts,
            answerKind,
            answerReason,
            searchIds,
            searchIsExample,
        ],
    );
    const openStudio = useCallback(
        (trigger: HandoffTrigger, routed: RunRoute | null = null) =>
            studioHandoff(trigger, routed).go(),
        [studioHandoff],
    );
    // A click on a Studio action. While the route's offer is on screen, the
    // click is the offer's, or the out-of-prompts card's.
    const studioClick = useCallback(
        () =>
            offerRoute
                ? openStudio(move === 'out_of_prompts' ? 'out_of_prompts' : 'offer', offerRoute)
                : openStudio('button'),
        [openStudio, offerRoute, move],
    );

    // False until the page's first deferred render commits. React gives
    // every useDeferredValue in one render the same deferred lane, so this
    // flips in the commit that also finishes the App Router's own deferred
    // render of the page (its layout router and head), which a hard load
    // leaves pending after hydration. React holds view transition types on
    // the root and hands them to the next commit made only of transition
    // lanes, so a move started before that commit would lose
    // `route-to-studio` to it and run with no slide.
    const pageSettled = useDeferredValue(true, false);

    // The automatic move, once per search, after the run's `done` so the
    // search settles (its usage event, the API's cached answer) first. It
    // runs in two commits. The first rewrites this history entry to the
    // question's `routing=off` URL marked `via=move_back` (moveBackHref), so
    // Back lands on the data search of the question, run once without the
    // router, as source `move_back`. The rewrite keeps the run's `q`, so the
    // permalink effect reads no arrival in it. The second, once
    // `searchParams` shows the rewrite, holds the callout for MOVE_PAUSE_MS
    // and then opens Studio. By then the App Router has stored its own
    // state for the rewritten entry, which Back needs to restore it in
    // place, and the rewrite's commit cannot take the move's transition
    // type. The pause also fetches Studio's page in full, which loads its
    // client code. A navigation whose page code is still loading commits
    // twice, the router state and then the page, and the first commit takes
    // the transition type, so the page would swap with no slide.
    //
    // During the pause, Escape or the callout's "Search the data instead"
    // keeps the reader here (stayOnData). The pause holds while the pointer
    // is over the callout or focus is inside it, and starts again in full
    // on leaving. A plain click on a link to another page (clickLeavesPage)
    // stops the move with no search and no event, so the link's navigation
    // wins. A new search ends the pause too, before any navigation.
    const movedSearchRef = useRef<string | null>(null);
    // Whether the pointer or focus is on the callout, and the pause's own
    // handlers for the callout while the pause runs.
    const moveHeldRef = useRef(false);
    const movePauseRef = useRef<{ restart: () => void; stay: () => void } | null>(null);
    const holdMove = (held: boolean) => {
        moveHeldRef.current = held;
        movePauseRef.current?.restart();
    };
    const readyMove = useEffectEvent(() => studioHandoff('auto', route));
    // Keeps the reader on the data search of a question the router sent to
    // Studio: the move's pause, or the out-of-prompts card's data action.
    // It records `search.route_stay`, turns the move's callout into the
    // Studio card (the out-of-prompts card leaves none), writes the
    // question's `routing=off` URL with no `via`, and searches the question
    // as data (`route_stay`). The event
    // names the trigger, so each way of staying counts apart from Studio's
    // way back (`studio.route_back`).
    const stayOnData = (trigger: RouteStayTrigger) => {
        // The card and the event carry the routed search's trace id, which
        // the search about to run replaces.
        const traceId = route?.traceId ?? searchIds().traceId;

        track('search.route_stay', { traceId, trigger });

        if (route && trigger !== 'out_of_prompts') {
            setStayed({ query, route: { ...route, traceId } });
        }

        // Drops the move's `via=move_back` too, so a reload of the data
        // search records `routing_off`.
        window.history.replaceState(null, '', dataSearchHref({ query, routingOff: true }));

        runQuery(query, 'route_stay');
    };
    // Once the move has started (or a link click has stopped it), a stay
    // comes too late and does nothing.
    const stay = useEffectEvent((searchId: string, trigger: RouteStayTrigger) => {
        if (movedSearchRef.current === searchId) {
            return;
        }

        movedSearchRef.current = searchId;
        stayOnData(trigger);
    });
    useEffect(() => {
        if (move !== 'auto' || phase !== 'done' || !pageSettled) {
            return;
        }

        const { searchId } = searchIds();

        if (!searchId || movedSearchRef.current === searchId) {
            return;
        }

        if (!routingOffFor(searchParams, query)) {
            window.history.replaceState(null, '', moveBackHref(query));

            return;
        }

        const handoff = readyMove();

        router.prefetch(handoff.href, { kind: PrefetchKind.FULL });

        let timer = 0;
        // Clears the timer, and starts it again in full unless the callout
        // holds the pause or the move has stopped.
        const restart = () => {
            window.clearTimeout(timer);

            if (moveHeldRef.current || movedSearchRef.current === searchId) {
                return;
            }

            timer = window.setTimeout(() => {
                movedSearchRef.current = searchId;
                handoff.go();
            }, MOVE_PAUSE_MS);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                stay(searchId, 'escape');
            }
        };
        const onClick = (event: MouseEvent) => {
            const link = event.target instanceof Element ? event.target.closest('a[href]') : null;

            if (
                clickLeavesPage(
                    event,
                    link instanceof HTMLAnchorElement
                        ? { href: link.href, target: link.target }
                        : null,
                    window.location.href,
                )
            ) {
                window.clearTimeout(timer);
                movedSearchRef.current = searchId;
            }
        };

        restart();
        movePauseRef.current = { restart, stay: () => stay(searchId, 'button') };
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('click', onClick, true);

        return () => {
            window.clearTimeout(timer);
            movePauseRef.current = null;
            document.removeEventListener('keydown', onKey, true);
            document.removeEventListener('click', onClick, true);
        };
    }, [move, phase, pageSettled, searchIds, searchParams, query, router]);

    // A visitor's action on the answer on screen (docs/analytics.md): the
    // ids are read as the visitor acts, and the returned sender records it.
    const startAction = useCallback(
        () => startSearchAction<SearchAction>(searchIds, track, location.pathname),
        [searchIds],
    );

    // Empties the prompt. A draft left over from a submitted question would
    // otherwise bring idle back in typing mode, which hides a link refusal.
    const clearPrompt = useCallback(() => {
        setDraft('');
        setPrefill('');
        setPromptEpoch((epoch) => epoch + 1);
    }, []);

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
        setStayed(null);
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
    // The homepage prompt adds `via` (typed or example), read here and
    // stripped at once, so the address bar never offers it for copying and
    // a pasted link records `permalink`. `routing=off` stays (runQuery).
    useEffect(() => {
        const q = searchParams.get('q');
        const s = searchParams.get('s') ?? '';
        const key = `${q}|${s}`;

        if (!q || startedRef.current === key) {
            return;
        }

        startedRef.current = key;
        setStayed(null);

        const { source, href } = handoffArrival(searchParams);

        if (href) {
            window.history.replaceState(null, '', href);
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
            window.history.replaceState(
                null,
                '',
                dataSearchHref({ query, routingOff: routingOffHere(query) }),
            );

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
                dataSearchHref({ query, state: encoded, routingOff: routingOffHere(query) }),
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
        setStayed(null);
        reset();
        // The typing-mode trio must clear too, or idle comes back raised, with
        // the Try row hidden.
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
            setPromptEpoch((epoch) => epoch + 1);
        },
        [phase, reset, leaveShare],
    );

    const shareView = useCallback(async () => {
        const href = dataSearchHref({
            query,
            state: edits.length > 0 ? await encodePermalinkState({ query, edits }) : undefined,
            routingOff: routingOffHere(query),
        });
        const url = `${location.origin}${href}`;

        await navigator.clipboard.writeText(url);
        track('share.copy', shareCopyProps({ kind: 'search', copied: 'query_link', share: null }));
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
    const tiles = catalogueTiles(catalogue, 'publishers');

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
    const noDataPartsToRender = studioHandoffParts(
        noDataCardParts(parts, isSlotted),
        query,
        studioOffered,
    );

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
        <section
            ref={sectionRef}
            className={styles.section}
            data-nav-dark="true"
            data-arrival={arrivedRouteOff ? 'route' : undefined}
        >
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
                            onChange={setDraft}
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
                    {!typing && (
                        <div className={styles.idleBottom} data-reveal-group="trigger">
                            <div className={styles.buildBox} data-reveal style={revealIndex(0)}>
                                <h2 className={styles.buildTitle}>Build a Dataset</h2>
                                <p className={styles.buildText}>
                                    Describe the data you need, tune the parameters, and export a
                                    structured dataset from the DFO knowledge graph.
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
                    {phase === 'done' && move !== 'auto' && (
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

                    {answer && move !== 'auto' ? (
                        // A catalogue or declined answer: no parts, no
                        // dataset, the query as the heading.
                        <div className={classNames(styles.hero, styles.heroBare)}>
                            <div className={styles.heroMain}>
                                <p className={styles.eyebrow}>Your Query</p>
                                <h1 className={styles.query}>{query}</h1>
                                {stayedRoute && studioOffered && (
                                    <StudioOffer onStudio={studioClick} inPlace />
                                )}
                                <SearchAnswer
                                    answer={answer}
                                    catalogue={catalogue}
                                    onRun={(text) => submitQuery(text, 'example')}
                                    onStartNew={startNew}
                                    onShowCatalogue={() =>
                                        submitQuery(STARTING_POINT_QUERY, 'catalogue')
                                    }
                                    onStudio={
                                        studioOffered && !declineOffers ? undefined : studioClick
                                    }
                                    onData={
                                        declineOffers && move === 'out_of_prompts'
                                            ? () => stayOnData('out_of_prompts')
                                            : undefined
                                    }
                                />
                                {studioOffered && !stayedRoute && !declineOffers && (
                                    <StudioOffer
                                        onStudio={studioClick}
                                        onData={
                                            move === 'out_of_prompts'
                                                ? () => stayOnData('out_of_prompts')
                                                : undefined
                                        }
                                    />
                                )}
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
                                    onStudio={studioOffered ? undefined : studioClick}
                                    refine={refine}
                                    onRefineOpen={setRefineOpen}
                                    openMenu={openMenu}
                                    onOpenMenuChange={setOpenMenu}
                                    onMenuChanges={reportMenuChanges}
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

                                {/* The automatic move holds the loading view, its
                                    callout in the status line's place, and a
                                    move the reader stayed out of leaves the
                                    Studio card there. */}
                                {move === 'auto' ? (
                                    <StudioMove
                                        onStay={() => movePauseRef.current?.stay()}
                                        onHold={() => holdMove(true)}
                                        onRelease={() => holdMove(false)}
                                    />
                                ) : (
                                    stayedRoute &&
                                    studioOffered && <StudioOffer onStudio={studioClick} inPlace />
                                )}

                                {move === 'auto' ? null : !response ? (
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
                                        changeAction={changeAction}
                                    />
                                )}

                                {studioOffered && !stayedRoute && (
                                    <StudioOffer onStudio={studioClick} />
                                )}
                            </div>
                            {response && definiteParts.length === 1 && (
                                <SearchPanel
                                    spec={definiteParts[0].hydratedSpec}
                                    note={downloadNote(definiteParts[0].part?.warnings)}
                                    createShare={createShare}
                                    onStudio={
                                        studioDeparture || studioOffered ? undefined : studioClick
                                    }
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
                                    onStudio={studioClick}
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
