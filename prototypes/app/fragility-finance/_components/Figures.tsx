'use client';

import { createContext, use, type ReactNode } from 'react';

import type { Figures } from '../_lib/figures.ts';

const Context = createContext<Figures | null>(null);

/** The page's figures, for every component under `FiguresProvider`. */
export const usePageFigures = (): Figures => {
    const value = use(Context);

    if (value === null) {
        throw new Error('usePageFigures needs a FiguresProvider above it');
    }

    return value;
};

/**
 * Holds the figures the build read (./FragilityPage.tsx) for the island and the prose around
 * it, so both print the same ones.
 */
export const FiguresProvider = ({
    figures,
    children,
}: {
    figures: Figures;
    children: ReactNode;
}) => <Context value={figures}>{children}</Context>;
