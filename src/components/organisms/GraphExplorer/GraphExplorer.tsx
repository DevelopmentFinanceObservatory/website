'use client';

import { useEffect, useRef, useState } from 'react';

import { BreakableId } from './BreakableId';
import {
    FullModelProvider,
    ModelProvider,
    NavigationProvider,
    useExplore,
    useExploreState,
    useModel,
} from './ExploreContext';
import FocusView, { CentreNotice, Refused, useRetryFocus, ViewLoading } from './FocusView';
import styles from './GraphExplorer.module.scss';
import LoadStatus from './LoadStatus';
import ScopedList from './ScopedList';
import StartScreen from './StartScreen';
import TopBar from './TopBar';
import { TermSourcesProvider } from './ListToggle';
import { useExplorerData } from './useExplorerData';
import { useNodeView } from './useNodeView';

import Button from '@/components/atoms/Button/Button';
import Spinner from '@/components/atoms/Spinner/Spinner';
import {
    checkFilter,
    exploreQuery,
    listScopeExists,
    NO_CARRIED,
    NO_FILTER,
    START_VIEW,
    type ExploreView,
} from '@/lib/graphExplorer/explore';
import { LOADING } from '@/lib/graphExplorer/load';
import { navigationFocus } from '@/lib/graphExplorer/navFocus';
import type { DatasetFilter, ListScope, Model } from '@/lib/graphExplorer/model';
import {
    awaitedDataset,
    classListGaps,
    needsNodeView,
    routeCentre,
} from '@/lib/graphExplorer/nodeView';

/** The line naming a filtered dataset the model lacks, with a way to clear the filter. */
const UnknownFilter = ({ id, onClear }: { id: string; onClear: () => void }) => (
    <p className={styles.filterNote} role="status">
        <span>
            The model has no dataset{' '}
            <code>
                <BreakableId text={id} />
            </code>
            , so nothing is filtered.
        </span>
        <Button variant="bordered" small onClick={onClear}>
            Clear
        </Button>
    </p>
);

/** The line over a view drawn unfiltered while an outside usage document that may hold the filtered dataset loads. */
const AwaitedFilter = ({ id }: { id: string }) => (
    <p className={styles.filterNote} role="status">
        <Spinner size={16} label="Loading" />
        <span>
            Loading{' '}
            <code>
                <BreakableId text={id} />
            </code>{' '}
            from the graph. The view shows every dataset until it arrives.
        </span>
    </p>
);

const Missing = ({
    id,
    onStart,
    textRef,
}: {
    id: string;
    onStart: () => void;
    textRef?: React.Ref<HTMLParagraphElement>;
}) => (
    <div className={styles.missing} role="status">
        <p ref={textRef} tabIndex={-1} data-view-heading>
            The model has no kind of thing{' '}
            <code>
                <BreakableId text={id} />
            </code>
            , so it has no properties to list.
        </p>
        <div>
            <Button onClick={onStart}>Start</Button>
        </div>
    </div>
);

/**
 * A scoped list. A class the DFO document declares lists from the scoped
 * model. Any other class lists from the model its node view builds, as its
 * centred view draws: a class the document holds lists from the full model
 * until the view lands, and a class it lacks waits for the view or shows
 * the refusal. The list says what its node view leaves out
 * (classListGaps). A scope the model it lists from holds no class or value
 * list for reads as missing, unless the view's failure or refusal already
 * says why. After Try Again, the list's title or the refusal takes focus
 * (`useRetryFocus`).
 */
const ListScreen = ({
    scope,
    show,
    full,
}: {
    scope: ListScope;
    show: DatasetFilter;
    full: Model;
}) => {
    const { go } = useExplore();
    const scoped = useModel();
    const centre = scope.kind === 'class' ? ({ kind: 'node', id: scope.id } as const) : null;
    const outside = centre !== null && needsNodeView(full, centre);
    const { state, lastFailure, retry } = useNodeView(outside ? centre.id : null);
    const route = outside ? routeCentre(full, centre, state, { lastFailure }) : null;
    const failing = route?.kind === 'draw' && route.line?.kind === 'failed';
    const { heading, text, onRetry } = useRetryFocus(failing, retry);

    if (!outside || route === null) {
        return scope.kind === 'class' && !listScopeExists(scoped, scope) ? (
            <Missing id={scope.id} onStart={() => go(START_VIEW)} />
        ) : (
            <ScopedList scope={scope} show={show} />
        );
    }
    switch (route.kind) {
        case 'loading':
            return <ViewLoading id={centre.id} waiting={route.waiting} />;
        case 'refused':
            return <Refused id={centre.id} refusal={route.refusal} textRef={text} />;
        case 'draw': {
            const { line, model, completeness } = route;
            // The list marks what its model leaves out itself, so the notice carries only the line.
            const notice = (
                <CentreNotice
                    id={centre.id}
                    name={model.label(centre.id)}
                    line={line}
                    onRetry={onRetry}
                />
            );
            if (listScopeExists(model, scope)) {
                return (
                    <>
                        {notice}
                        <ScopedList
                            scope={scope}
                            show={show}
                            classModel={model}
                            gaps={classListGaps(centre.id, completeness)}
                            headingRef={heading}
                        />
                    </>
                );
            }
            if (line?.kind === 'refused') {
                return <Refused id={centre.id} refusal={line.refusal} textRef={text} />;
            }
            return line === null ? (
                <Missing id={centre.id} onStart={() => go(START_VIEW)} textRef={text} />
            ) : (
                <div tabIndex={-1} data-view-heading>
                    {notice}
                </div>
            );
        }
    }
};

/**
 * The Explore screen: the top bar over one view chosen by the URL. The model
 * loads once; until it is ready the view shows its progress or its failure.
 * The start screen and the lists read the scoped model, so the origin
 * switches widen them. A centred term or dataset reads the full model, so
 * its view shows every model's use of it whatever the switches say. The
 * dataset filter is checked against every dataset loaded, so a dataset the
 * reader names in `?show=` filters whatever the switches say. A dataset
 * named in `?dataset=` that the full model lacks waits while an outside
 * usage document loads. One named in `?show=` leaves the view unfiltered,
 * with a line saying so, on every view that reads the filter. Either reads
 * as missing only once each document has settled.
 */
const GraphExplorer = () => {
    const navigation = useExploreState();
    const data = useExplorerData();
    const model = data.model.status === 'ready' ? data.model.value : null;
    const { view } = navigation.state;
    const { show } = navigation.state;
    const mainRef = useRef<HTMLElement>(null);
    const [focusAfterMove] = useState(navigationFocus);
    const fromHistory = useRef(false);
    const viewKey = exploreQuery({ view, ...NO_CARRIED });

    // The back and forward buttons move the view without `go`, which scrolls to the top.
    useEffect(() => {
        const onPopState = () => {
            fromHistory.current = true;
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    // A view that is still loading draws its heading later, so the debt is watched in the DOM.
    useEffect(() => {
        const main = mainRef.current;
        if (main === null) return;
        focusAfterMove.arrive(viewKey);
        if (fromHistory.current) {
            fromHistory.current = false;
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
        if (!focusAfterMove.pay(main, document)) return;
        const observer = new MutationObserver(() => {
            if (!focusAfterMove.pay(main, document)) observer.disconnect();
        });
        observer.observe(main, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [focusAfterMove, viewKey]);
    const awaitedOf = (id: string | null) =>
        data.full === null ? null : awaitedDataset(data.full, [id], data.usage);
    const awaited = awaitedOf(view.kind === 'dataset' ? view.id : null);
    const awaitedFilter = awaitedOf(show.kind === 'dataset' ? show.id : null);
    const checked = data.full ? checkFilter(data.full, show) : { show: NO_FILTER, unknown: null };
    const filter = awaitedFilter === null ? checked : { show: NO_FILTER, unknown: null };

    const screen = (full: Model, view: ExploreView, show: DatasetFilter) => {
        switch (view.kind) {
            case 'start':
                return <StartScreen />;
            case 'list':
                return <ListScreen scope={view.scope} show={show} full={full} />;
            case 'node':
            case 'dataset':
                return <FocusView centre={view} show={show} full={full} />;
        }
    };

    return (
        <NavigationProvider value={navigation}>
            <ModelProvider value={model}>
                <FullModelProvider value={data.full}>
                    <TermSourcesProvider>
                        <div className={styles.explorer}>
                            <TopBar />
                            <main className={styles.main} key={viewKey} ref={mainRef}>
                                {/* The full model is in whenever the scoped one is, since both build from the DFO pair. */}
                                {data.model.status === 'ready' && data.full !== null ? (
                                    awaited !== null ? (
                                        <ViewLoading id={awaited} waiting={null} />
                                    ) : (
                                        <>
                                            {/* The start screen reads no filter, so it says nothing of a filter dataset that is loading. */}
                                            {awaitedFilter !== null && view.kind !== 'start' && (
                                                <AwaitedFilter id={awaitedFilter} />
                                            )}
                                            {filter.unknown !== null && (
                                                <UnknownFilter
                                                    id={filter.unknown}
                                                    onClear={() => navigation.setShow(NO_FILTER)}
                                                />
                                            )}
                                            {screen(data.full, view, filter.show)}
                                        </>
                                    )
                                ) : (
                                    <LoadStatus
                                        state={data.model.status === 'ready' ? LOADING : data.model}
                                        onRetry={data.retryModel}
                                    />
                                )}
                            </main>
                        </div>
                    </TermSourcesProvider>
                </FullModelProvider>
            </ModelProvider>
        </NavigationProvider>
    );
};

export default GraphExplorer;
