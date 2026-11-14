'use client';

import { useSearchParams } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo } from 'react';

import {
    exploreHref,
    readCarried,
    readExplore,
    moveHref,
    type Carried,
    type ExploreState,
    type ExploreView,
} from '@/lib/graphExplorer/explore';
import type { DatasetFilter, Model } from '@/lib/graphExplorer/model';

export type ExploreNavigation = {
    /** The view, the dataset filter and the base switch the URL holds. */
    readonly state: ExploreState;
    /** The address of a view, keeping the carried parameters. */
    readonly hrefFor: (view: ExploreView) => string;
    /**
     * Opens a view as a new history entry, keeping the carried parameters.
     * The view already on show adds no entry.
     */
    readonly go: (view: ExploreView) => void;
    /** Changes the dataset filter in place, and the back button skips it. */
    readonly setShow: (show: DatasetFilter) => void;
};

const NavigationContext = createContext<ExploreNavigation | null>(null);
const ModelContext = createContext<Model | null>(null);

/** The parameters every Graph Explorer link keeps, read from the URL query. */
export const useCarried = (): Carried => {
    const params = useSearchParams();
    return useMemo(() => readCarried(params), [params]);
};

/**
 * Explore's state from the URL query. Views move with history.pushState,
 * which Next's router follows, so useSearchParams re-reads on every move and
 * on the back and forward buttons, with no server round trip.
 */
export const useExploreState = (): ExploreNavigation => {
    const params = useSearchParams();
    const state = useMemo(() => readExplore(params), [params]);

    const hrefFor = useCallback((view: ExploreView) => exploreHref({ ...state, view }), [state]);

    const go = useCallback(
        (view: ExploreView) => {
            const href = moveHref(state, view);
            if (href === null) return;
            window.history.pushState(null, '', href);
            window.scrollTo({ top: 0, behavior: 'instant' });
        },
        [state],
    );

    const setShow = useCallback(
        (show: DatasetFilter) => {
            window.history.replaceState(null, '', exploreHref({ ...state, show }));
        },
        [state],
    );

    return useMemo(() => ({ state, hrefFor, go, setShow }), [state, hrefFor, go, setShow]);
};

export const NavigationProvider = NavigationContext.Provider;
export const ModelProvider = ModelContext.Provider;

/** Explore's navigation, or null outside GraphExplorer. */
export const useOptionalExplore = (): ExploreNavigation | null => useContext(NavigationContext);

/** Explore's navigation. Throws outside GraphExplorer. */
export const useExplore = (): ExploreNavigation => {
    const navigation = useContext(NavigationContext);
    if (!navigation) throw new Error('useExplore is used outside GraphExplorer');
    return navigation;
};

/** The loaded model. Throws until the model is ready. */
export const useModel = (): Model => {
    const model = useContext(ModelContext);
    if (!model) throw new Error('useModel is used before the model is loaded');
    return model;
};
