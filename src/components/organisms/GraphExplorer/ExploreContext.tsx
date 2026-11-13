'use client';

import { useSearchParams } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo } from 'react';

import {
    exploreHref,
    readExplore,
    type ExploreState,
    type ExploreView,
} from '@/lib/graphExplorer/explore';
import type { DatasetFilter, Model } from '@/lib/graphExplorer/model';

export type ExploreNavigation = {
    /** The view and dataset filter the URL holds. */
    readonly state: ExploreState;
    /** The address of a view under the current dataset filter. */
    readonly hrefFor: (view: ExploreView) => string;
    /** Opens a view as a new history entry, keeping the dataset filter. */
    readonly go: (view: ExploreView) => void;
    /** Changes the dataset filter in place: the back button skips it. */
    readonly setShow: (show: DatasetFilter) => void;
};

const NavigationContext = createContext<ExploreNavigation | null>(null);
const ModelContext = createContext<Model | null>(null);

/**
 * Explore's state from the URL query. Views move with history.pushState,
 * which Next's router follows, so useSearchParams re-reads on every move and
 * on the back and forward buttons, with no server round trip.
 */
export const useExploreState = (): ExploreNavigation => {
    const params = useSearchParams();
    const state = useMemo(() => readExplore(params), [params]);

    const hrefFor = useCallback(
        (view: ExploreView) => exploreHref({ view, show: state.show }),
        [state.show],
    );

    const go = useCallback(
        (view: ExploreView) => {
            window.history.pushState(null, '', hrefFor(view));
            window.scrollTo({ top: 0, behavior: 'instant' });
        },
        [hrefFor],
    );

    const setShow = useCallback(
        (show: DatasetFilter) => {
            window.history.replaceState(null, '', exploreHref({ view: state.view, show }));
        },
        [state.view],
    );

    return useMemo(() => ({ state, hrefFor, go, setShow }), [state, hrefFor, go, setShow]);
};

export const NavigationProvider = NavigationContext.Provider;
export const ModelProvider = ModelContext.Provider;

/** Explore's navigation, or null outside GraphExplorer. */
export const useOptionalExplore = (): ExploreNavigation | null => useContext(NavigationContext);

/** Explore's navigation; only inside GraphExplorer. */
export const useExplore = (): ExploreNavigation => {
    const navigation = useContext(NavigationContext);
    if (!navigation) throw new Error('useExplore is used outside GraphExplorer');
    return navigation;
};

/** The loaded model; only inside a screen GraphExplorer renders once the model is ready. */
export const useModel = (): Model => {
    const model = useContext(ModelContext);
    if (!model) throw new Error('useModel is used before the model is loaded');
    return model;
};
