'use client';

import { useAidFigures } from './AidProse';
import { UnaidsStatus } from './UnaidsStatus';
import { useUnaids } from './useUnaids';

import { plhivGapNote, unaidsGapNote } from '../_lib/copy.ts';
import { joinUnaids } from '../_lib/unaids.ts';

/**
 * The Notes items on the UNAIDS figures the table lacks, as list items. They derive from the
 * reads in the browser, so they show a loading line first, or the failure, which the table's
 * line announces. The countries and years are the island's, from AidProvider.
 */
export const UnaidsNotes = () => {
    const { countries, years } = useAidFigures().data;
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
