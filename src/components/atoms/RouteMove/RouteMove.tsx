import { ViewTransition } from 'react';

import { ROUTE_TO_DATA, ROUTE_TO_STUDIO } from '@/lib/search/studioHandoff';

/**
 * One side of the move between Get Data and Studio, keyed by the
 * navigation's transition type (ROUTE_TO_STUDIO, ROUTE_TO_DATA in
 * src/lib/search/studioHandoff.ts). Studio is the `sheet`, which slides in
 * over the site and back off it; the site layout, header included, is the
 * `under` layer it covers. The keyframes live in src/styles/_route-move.scss.
 *
 * React starts a document view transition when a navigation mounts a
 * `<ViewTransition>`, or unmounts one that animates, and it drops the root
 * snapshot when no boundary changes size, so the move runs on these named
 * layers. A navigation with neither type names nothing and swaps the page
 * at once.
 */
const RouteMove = ({
    layer,
    children,
}: {
    layer: 'sheet' | 'under';
    children: React.ReactNode;
}) => {
    const moves = { [ROUTE_TO_STUDIO]: `route-${layer}`, [ROUTE_TO_DATA]: `route-${layer}` };

    return (
        <ViewTransition
            enter={{ ...moves, default: 'none' }}
            exit={{ ...moves, default: 'none' }}
            default="none"
        >
            {children}
        </ViewTransition>
    );
};

export default RouteMove;
