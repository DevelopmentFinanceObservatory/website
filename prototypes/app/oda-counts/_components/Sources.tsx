'use client';

import { useLiveUnits } from './LiveUnits';

import prose from '../../../components/Prose/Prose.module.scss';

/** counts.json's provenance describes the figures on screen. */
const useCommitted = (): boolean => {
    const { tier, asCommitted } = useLiveUnits();

    return tier !== 'stored' || asCommitted;
};

const DFO = (
    <a className={prose.a} href="https://developmentfinance.org/data">
        Development Finance Observatory
    </a>
);

/** The Sources paragraph's citation: counts.json's while it describes the figures. */
export const SourceCitation = ({ citation }: { citation: string }) =>
    useCommitted() ? <>{citation}.</> : <>OECD DAC1, via the Development Finance Observatory.</>;

/** Where and when the figures were read: counts.json's retrieval date while it describes them,
 *  otherwise DFO's newest stored versions, read when the page loaded. */
export const SourceRead = ({ retrieved }: { retrieved: string }) =>
    useCommitted() ? (
        <>
            Fetched from the {DFO} on {retrieved.slice(0, 10)}.
        </>
    ) : (
        <>Read from the {DFO} when the page loaded, at the newest versions it stores.</>
    );
