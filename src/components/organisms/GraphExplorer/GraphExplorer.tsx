'use client';

import { ModelProvider, NavigationProvider, useExploreState } from './ExploreContext';
import FocusView from './FocusView';
import styles from './GraphExplorer.module.scss';
import LoadStatus from './LoadStatus';
import ScopedList from './ScopedList';
import StartScreen from './StartScreen';
import TopBar from './TopBar';
import { useExplorerData } from './useExplorerData';

import Button from '@/components/atoms/Button/Button';
import { exploreQuery, NO_FILTER, START_VIEW, type ExploreView } from '@/lib/graphExplorer/explore';
import type { DatasetFilter, Model } from '@/lib/graphExplorer/model';

/** The filter the URL names, or none when it names a dataset the model lacks. */
const knownFilter = (model: Model, show: DatasetFilter): DatasetFilter =>
    show.kind === 'dataset' && !model.dataset(show.id) ? NO_FILTER : show;

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
    const baseTerms =
        data.includeBase && data.terms?.status === 'ready' ? data.terms.value : undefined;

    const screen = (ready: Model, view: ExploreView) => {
        const show = knownFilter(ready, navigation.state.show);
        switch (view.kind) {
            case 'start':
                return (
                    <StartScreen
                        includeBase={data.includeBase}
                        terms={data.terms}
                        onIncludeBase={data.setIncludeBase}
                    />
                );
            case 'list': {
                const { scope } = view;
                if (scope.kind === 'class') {
                    const kind = ready.kind(scope.id);
                    if (kind !== 'class' && kind !== 'valueList') {
                        return <Missing id={scope.id} onStart={() => navigation.go(START_VIEW)} />;
                    }
                }
                return <ScopedList scope={scope} show={show} />;
            }
            case 'node':
            case 'dataset':
                return <FocusView centre={view} show={show} baseTerms={baseTerms} />;
        }
    };

    return (
        <NavigationProvider value={navigation}>
            <ModelProvider value={model}>
                <div className={styles.explorer}>
                    <TopBar screen="explore" model={model} baseTerms={baseTerms} />
                    <main
                        className={styles.main}
                        key={exploreQuery({ view: navigation.state.view, show: NO_FILTER })}
                    >
                        {data.model.status === 'ready' ? (
                            screen(data.model.value, navigation.state.view)
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
