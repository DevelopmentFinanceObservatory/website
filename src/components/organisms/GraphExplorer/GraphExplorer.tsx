'use client';

import { ModelProvider, NavigationProvider, useExploreState } from './ExploreContext';
import FocusView from './FocusView';
import styles from './GraphExplorer.module.scss';
import LoadStatus from './LoadStatus';
import ScopedList from './ScopedList';
import StartScreen from './StartScreen';
import TopBar from './TopBar';
import { LOADING, useExplorerData } from './useExplorerData';

import Button from '@/components/atoms/Button/Button';
import {
    awaitsTerms,
    checkFilter,
    exploreQuery,
    listScopeExists,
    NO_CARRIED,
    NO_FILTER,
    START_VIEW,
    type ExploreView,
} from '@/lib/graphExplorer/explore';
import type { DatasetFilter, Model } from '@/lib/graphExplorer/model';

/** The line naming a filtered dataset the model lacks, with a way to clear the filter. */
const UnknownFilter = ({ id, onClear }: { id: string; onClear: () => void }) => (
    <p className={styles.filterNote} role="status">
        <span>
            The model has no dataset <code>{id}</code>, so nothing is filtered.
        </span>
        <Button variant="bordered" small onClick={onClear}>
            Clear
        </Button>
    </p>
);

const Missing = ({ id, onStart }: { id: string; onStart: () => void }) => (
    <div className={styles.missing} role="status">
        <p>
            The model has no kind of thing <code>{id}</code>, so it has no properties to list.
        </p>
        <div>
            <Button onClick={onStart}>Start</Button>
        </div>
    </div>
);

/**
 * The Explore screen: the top bar over one view chosen by the URL. The model
 * loads once; until it is ready the view shows its progress or its failure.
 */
const GraphExplorer = () => {
    const navigation = useExploreState();
    const data = useExplorerData();
    const model = data.model.status === 'ready' ? data.model.value : null;
    const { baseTerms } = data;
    const filter = model
        ? checkFilter(model, navigation.state.show)
        : { show: NO_FILTER, unknown: null };

    const screen = (ready: Model, view: ExploreView, show: DatasetFilter) => {
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
                if (awaitsTerms(ready, view, data.base, baseTerms !== undefined)) {
                    // The terms list is null for the render before its load starts.
                    const terms =
                        data.terms === null || data.terms.status === 'ready' ? LOADING : data.terms;
                    return <LoadStatus state={terms} onRetry={data.retryTerms} subject="terms" />;
                }
                return <FocusView centre={view} show={show} baseTerms={baseTerms} />;
        }
    };

    return (
        <NavigationProvider value={navigation}>
            <ModelProvider value={model}>
                <div className={styles.explorer}>
                    <TopBar />
                    <main
                        className={styles.main}
                        key={exploreQuery({ view: navigation.state.view, ...NO_CARRIED })}
                    >
                        {data.model.status === 'ready' ? (
                            <>
                                {filter.unknown !== null && (
                                    <UnknownFilter
                                        id={filter.unknown}
                                        onClear={() => navigation.setShow(NO_FILTER)}
                                    />
                                )}
                                {screen(data.model.value, navigation.state.view, filter.show)}
                            </>
                        ) : (
                            <LoadStatus state={data.model} onRetry={data.retryModel} />
                        )}
                    </main>
                </div>
            </ModelProvider>
        </NavigationProvider>
    );
};

export default GraphExplorer;
