'use client';

import { createContext, use, type ReactNode } from 'react';

import { SectionRail, type RailSection } from '../../../components/SectionRail/SectionRail';

import { CitedText } from './SourceLink';
import { useAid, type Aid } from './useAid';

import type { HivData } from '../_data/types.ts';
import { AID_CITED, AID_TEXT, aidSections } from '../_lib/copy.ts';

const Context = createContext<Aid | null>(null);

/** The page's aid figures, for every component under `AidProvider`. */
export const useAidFigures = (): Aid => {
    const value = use(Context);

    if (value === null) {
        throw new Error('useAidFigures needs an AidProvider above it');
    }

    return value;
};

/**
 * Holds the page's aid figures (`useAid`) for the island and the prose around it, so both
 * print the same ones. These are hiv.json's in the static HTML and until a live read
 * settles, and the read's after.
 */
export const AidProvider = ({ data, children }: { data: HivData; children: ReactNode }) => (
    <Context value={useAid(data)}>{children}</Context>
);

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
