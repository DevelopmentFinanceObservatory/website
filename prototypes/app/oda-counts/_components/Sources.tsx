'use client';

import { useLiveUnits } from './LiveUnits';

import prose from '../../../components/Prose/Prose.module.scss';

import { retrievedParts } from '#lib/storedCheck.ts';
import { useRetrieved } from '#lib/useStoredCheck.ts';

/** The Sources paragraph's citation, as DFO gives it for the reads the figures come from. */
export const SourceCitation = () => <>{useLiveUnits().citation}.</>;

/** When the figures shown were read, in UTC: by the build, or again once the page refreshed
 *  them. */
export const SourceRead = () => {
    const { day, time } = retrievedParts(useRetrieved());

    return (
        <>
            Read from the{' '}
            <a className={prose.a} href="https://developmentfinance.org/data">
                Development Finance Observatory
            </a>{' '}
            on {day} at {time} UTC, at the newest versions it stores.
        </>
    );
};
