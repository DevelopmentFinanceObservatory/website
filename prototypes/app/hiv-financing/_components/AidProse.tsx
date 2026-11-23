'use client';

import type { StoredVersionsJson } from '@developmentfinance/client/types';
import { createContext, use, type ReactNode } from 'react';

import { SectionRail, type RailSection } from '../../../components/SectionRail/SectionRail';

import { CitedText } from './SourceLink';

import { AID_CITED, AID_TEXT, aidSections } from '../_lib/copy.ts';
import type { HivFigures } from '../_lib/figures.ts';
import { loadRefresh } from '../_lib/refresh.ts';

import { retrievedParts } from '#lib/storedCheck.ts';
import { StoredCheckContext, useRetrieved, useStoredCheck } from '#lib/useStoredCheck.ts';

const Context = createContext<HivFigures | null>(null);

/** The page's figures, for every component under `AidProvider`. */
export const useAidFigures = (): HivFigures => {
    const value = use(Context);

    if (value === null) {
        throw new Error('useAidFigures needs an AidProvider above it');
    }

    return value;
};

/** Holds the figures the build read for the island and the prose around it, so both print the
 *  same ones, and when they were read. After paint it checks DFO for newer stored data than
 *  `stored`, the build's check, and holds the figures read again, and when, when there is
 *  (lib/storedCheck.ts). */
export const AidProvider = ({
    figures,
    retrieved,
    stored,
    children,
}: {
    figures: HivFigures;
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

/** A sentence or figure of the prose outside the island, from the aid figures. */
export const AidText = ({ part }: { part: keyof typeof AID_TEXT }) => (
    <>{AID_TEXT[part](useAidFigures().data)}</>
);

/** Cited prose outside the island, from the aid figures. */
export const AidCited = ({
    part,
    className,
}: {
    part: keyof typeof AID_CITED;
    className?: string;
}) => <CitedText parts={AID_CITED[part](useAidFigures().data)} className={className} />;

/** The page's section rail: the island's two sections, titled from the aid figures as the
 *  island's headings are, then `after`. */
export const AidRail = ({ after }: { after: RailSection[] }) => (
    <SectionRail sections={[...aidSections(useAidFigures().data), ...after]} />
);
