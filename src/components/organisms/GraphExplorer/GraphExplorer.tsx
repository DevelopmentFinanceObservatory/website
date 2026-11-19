'use client';

import { BreakableId } from './BreakableId';
import {
    FullModelProvider,
    ModelProvider,
    NavigationProvider,
    useExplore,
    useExploreState,
    useModel,
} from './ExploreContext';
import FocusView, { CentreNotice, Refused, ViewLoading } from './FocusView';
import styles from './GraphExplorer.module.scss';
import LoadStatus from './LoadStatus';
import ScopedList from './ScopedList';
import StartScreen from './StartScreen';
import TopBar from './TopBar';
import { useExplorerData } from './useExplorerData';
import { useNodeView } from './useNodeView';

import Button from '@/components/atoms/Button/Button';
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
import type { DatasetFilter, ListScope, Model } from '@/lib/graphExplorer/model';
import { awaitedDataset, needsNodeView, routeCentre } from '@/lib/graphExplorer/nodeView';

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

const Missing = ({ id, onStart }: { id: string; onStart: () => void }) => (
    <div className={styles.missing} role="status">
        <p>
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
 * the refusal. A scope the model it lists from holds no class or value
 * list for reads as missing, unless the view's failure or refusal already
 * says why.
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

    if (!outside) {
        return scope.kind === 'class' && !listScopeExists(scoped, scope) ? (
            <Missing id={scope.id} onStart={() => go(START_VIEW)} />
        ) : (
            <ScopedList scope={scope} show={show} />
        );
    }
    const route = routeCentre(full, centre, state, lastFailure);
    switch (route.kind) {
        case 'loading':
            return <ViewLoading id={centre.id} waiting={route.waiting} />;
        case 'refused':
            return <Refused id={centre.id} refusal={route.refusal} />;
        case 'draw': {
            const { line, model } = route;
            const notice = <CentreNotice id={centre.id} line={line} view={null} onRetry={retry} />;
            if (listScopeExists(model, scope)) {
                return (
                    <>
                        {notice}
                        <ScopedList scope={scope} show={show} classModel={model} />
                    </>
                );
            }
            if (line?.kind === 'refused') return <Refused id={centre.id} refusal={line.refusal} />;
            return line === null ? (
                <Missing id={centre.id} onStart={() => go(START_VIEW)} />
            ) : (
                notice
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
 * named in `?dataset=` or `?show=` that the full model lacks waits while an
 * outside usage document loads, and reads as missing only once each has
 * settled.
 */
const GraphExplorer = () => {
    const navigation = useExploreState();
    const data = useExplorerData();
    const model = data.model.status === 'ready' ? data.model.value : null;
    const { view } = navigation.state;
    const { show } = navigation.state;
    const awaited =
        data.full === null
            ? null
            : awaitedDataset(
                  data.full,
                  [
                      view.kind === 'dataset' ? view.id : null,
                      show.kind === 'dataset' ? show.id : null,
                  ],
                  data.usage,
              );
    const filter = data.full ? checkFilter(data.full, show) : { show: NO_FILTER, unknown: null };

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
                    <div className={styles.explorer}>
                        <TopBar />
                        <main className={styles.main} key={exploreQuery({ view, ...NO_CARRIED })}>
                            {/* The full model is in whenever the scoped one is, since both build from the DFO pair. */}
                            {data.model.status === 'ready' && data.full !== null ? (
                                awaited !== null ? (
                                    <ViewLoading id={awaited} waiting={null} />
                                ) : (
                                    <>
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
                </FullModelProvider>
            </ModelProvider>
        </NavigationProvider>
    );
};

export default GraphExplorer;
