import { ViewTransition } from 'react';

import { ROUTE_TO_DATA, ROUTE_TO_STUDIO } from '@/lib/search/studioHandoff';

/**
 * The page side of the move between Get Data and Studio: the router's
 * automatic move to Studio (ROUTE_TO_STUDIO) carries the page forward, and
 * Studio's way back (ROUTE_TO_DATA) carries it back. Every other navigation,
 * and a browser without view transitions, swaps the page with no animation.
 * The keyframes live in src/styles/_route-move.scss.
 */
const RouteMove = ({ page, children }: { page: 'data' | 'studio'; children: React.ReactNode }) => {
    // Data leaves forward and comes back; Studio arrives forward and leaves back.
    const leave = page === 'data' ? ROUTE_TO_STUDIO : ROUTE_TO_DATA;
    const arrive = page === 'data' ? ROUTE_TO_DATA : ROUTE_TO_STUDIO;
    const direction = (type: string) => (type === ROUTE_TO_STUDIO ? 'route-forward' : 'route-back');

    return (
        <ViewTransition
            enter={{ [arrive]: direction(arrive), default: 'none' }}
            exit={{ [leave]: direction(leave), default: 'none' }}
            default="none"
        >
            {children}
        </ViewTransition>
    );
};

export default RouteMove;
