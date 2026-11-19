'use client';

import { UnaidsStatus } from './UnaidsStatus';
import { useUnaids } from './useUnaids';

import type { Country } from '../_data/types.ts';
import { plhivGapNote, unaidsGapNote } from '../_lib/copy.ts';
import { joinUnaids } from '../_lib/unaids.ts';

/**
 * The Notes items on the UNAIDS figures the table lacks, as list items. They derive from the
 * reads in the browser, so they show a loading line first, or the failure.
 */
export const UnaidsNotes = ({
    countries,
    years,
}: {
    /** The table's countries, in table order. */
    countries: readonly Pick<Country, 'iso3' | 'name'>[];
    years: readonly number[];
}) => {
    const state = useUnaids(countries, years);

    if (state.status !== 'ready') {
        return (
            <li>
                <UnaidsStatus state={state} what="these notes" />
            </li>
        );
    }

    const named = joinUnaids(countries, state.figures, years);
    const gaps = unaidsGapNote(named, years);

    return (
        <>
            <li>{plhivGapNote(named)}</li>
            {gaps !== null && <li>{gaps}</li>}
        </>
    );
};
