'use client';

import { useAidFigures } from './AidProse';

import { plhivGapNote, unaidsGapNote } from '../_lib/copy.ts';
import { joinUnaids } from '../_lib/unaids.ts';

/** The Notes items on the UNAIDS figures the table lacks, as list items, for the island's
 *  countries and years, from AidProvider. */
export const UnaidsNotes = () => {
    const {
        data: { countries, years },
        unaids,
    } = useAidFigures();
    const named = joinUnaids(countries, unaids, years);
    const gaps = unaidsGapNote(named, years);

    return (
        <>
            <li>{plhivGapNote(named)}</li>
            {gaps !== null && <li>{gaps}</li>}
        </>
    );
};
