'use client';

import type { StoredVersionsJson } from '@developmentfinance/client/types';
import { createContext, use, type ReactNode } from 'react';

import type { Figures } from '../_lib/figures.ts';
import { loadRefresh } from '../_lib/refresh.ts';

import { retrievedParts } from '#lib/storedCheck.ts';
import { StoredCheckContext, useRetrieved, useStoredCheck } from '#lib/useStoredCheck.ts';

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
 * it, so both print the same ones, and when they were read. After paint it checks DFO for newer
 * stored data than `stored`, the build's check, and holds the figures read again, and when, when
 * there is (lib/storedCheck.ts).
 */
export const FiguresProvider = ({
    figures,
    retrieved,
    stored,
    children,
}: {
    figures: Figures;
    retrieved: string;
    stored: StoredVersionsJson;
    children: ReactNode;
}) => {
    const { value, ...checked } = useStoredCheck(figures, retrieved, stored, loadRefresh);

    return (
        <StoredCheckContext value={checked}>
            <Context value={value}>{children}</Context>
        </StoredCheckContext>
    );
};

/** The day the figures shown were read, in UTC, as YYYY-MM-DD: the build's, or the read
 *  again's once the page refreshed them. */
export const Retrieved = () => retrievedParts(useRetrieved()).day;
