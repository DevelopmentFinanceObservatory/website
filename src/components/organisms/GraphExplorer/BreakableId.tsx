import { Fragment } from 'react';

import { idPieces } from '@/lib/graphExplorer/idBreaks';

/**
 * An id, code or path as text with a break opportunity after each "/", "."
 * and "_" (idPieces), the only places it may wrap. Anywhere else it moves to
 * the next line whole, and breaks inside only when one piece is wider than
 * the line, as the explorer's `overflow-wrap: break-word` allows.
 */
export const BreakableId = ({ text }: { text: string }) =>
    idPieces(text).map((piece, at) => (
        <Fragment key={at}>
            {at > 0 && <wbr />}
            {piece}
        </Fragment>
    ));
