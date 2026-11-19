'use client';

import { BreakableId } from './BreakableId';
import {
    FullModelProvider,
    ModelProvider,
    NavigationProvider,
    useExploreState,
} from './ExploreContext';
import FocusView from './FocusView';
import styles from './GraphExplorer.module.scss';
import LoadStatus from './LoadStatus';
import ScopedList from './ScopedList';
import StartScreen from './StartScreen';
import TopBar from './TopBar';
import { useExplorerData } from './useExplorerData';

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
import type { DatasetFilter, Model } from '@/lib/graphExplorer/model';

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
 * The Explore screen: the top bar over one view chosen by the URL. The model
 * loads once; until it is ready the view shows its progress or its failure.
 * The start screen and the lists read the scoped model, so the origin
 * switches widen them. A centred term or dataset reads the full model, so
 * its view shows every model's use of it whatever the switches say, and the
 * dataset filter on it is checked against every dataset loaded.
 */
const GraphExplorer = () => {
    const navigation = useExploreState();
    const data = useExplorerData();
    const model = data.model.status === 'ready' ? data.model.value : null;
    const { view } = navigation.state;
    const centred = view.kind === 'node' || view.kind === 'dataset';
    const filterModel = centred ? data.full : model;
    const filter = filterModel
        ? checkFilter(filterModel, navigation.state.show)
        : { show: NO_FILTER, unknown: null };

    const screen = (ready: Model, full: Model, view: ExploreView, show: DatasetFilter) => {
        switch (view.kind) {
            case 'start':
                return <StartScreen />;
            case 'list': {
                const { scope } = view;
                if (scope.kind === 'class' && !listScopeExists(ready, scope)) {
                    return <Missing id={scope.id} onStart={() => navigation.go(START_VIEW)} />;
                }
                return <ScopedList scope={scope} show={show} />;
            }
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
                            {/* The full model is in whenever the scoped one is: both build from the DFO pair. */}
                            {data.model.status === 'ready' && data.full !== null ? (
                                <>
                                    {filter.unknown !== null && (
                                        <UnknownFilter
                                            id={filter.unknown}
                                            onClear={() => navigation.setShow(NO_FILTER)}
                                        />
                                    )}
                                    {screen(data.model.value, data.full, view, filter.show)}
                                </>
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
