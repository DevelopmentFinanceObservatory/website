'use client';

import Link from 'next/link';

import styles from './RouteArrival.module.scss';

import { track } from '@/lib/events/client';
import { routeBackHref } from '@/lib/search/searchEvents';
import { ROUTE_TO_DATA } from '@/lib/search/studioHandoff';

/**
 * The line above a routed question's transcript: why the search API's router
 * moved it from Get Data, and the way back to a data search of the same
 * question with the router off. The way back replaces Studio in the history,
 * as the move replaced the data page, so Back does not ask the question again.
 */
const RouteArrival = ({ question, traceId }: { question: string; traceId: string | null }) => (
    <p className={styles.arrival}>
        Moved here from Get Data because it needs analysis.{' '}
        <Link
            href={routeBackHref(question)}
            replace
            prefetch={false}
            transitionTypes={[ROUTE_TO_DATA]}
            className={styles.back}
            onClick={() => track('studio.route_back', { traceId })}
        >
            Search the data instead
        </Link>
    </p>
);

export default RouteArrival;
