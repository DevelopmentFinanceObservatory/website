'use client';

import { createContext, use, type ReactNode } from 'react';

import { useFigures, type LiveFigures } from './useFigures';

import type { Context as Place, Groups } from '../_data/types.ts';

const Context = createContext<LiveFigures | null>(null);

/** The page's figures, for every component under `FiguresProvider`. */
export const usePageFigures = (): LiveFigures => {
    const value = use(Context);

    if (value === null) {
        throw new Error('usePageFigures needs a FiguresProvider above it');
    }

    return value;
};

/**
 * Holds the page's figures (`useFigures`) for the island and the prose around it, so both
 * print the same ones. These are the committed figures in the static HTML and until a live
 * read settles, and the read's after.
 */
export const FiguresProvider = ({
    contexts,
    groups,
    children,
}: {
    contexts: Place[];
    groups: Groups;
    children: ReactNode;
}) => <Context value={useFigures({ contexts, groups })}>{children}</Context>;
