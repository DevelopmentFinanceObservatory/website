'use client';

import Link, { useLinkStatus } from 'next/link';

import styles from './RouteArrival.module.scss';

import { track } from '@/lib/events/client';
import { routeBackHref } from '@/lib/search/searchEvents';
import { ROUTE_TO_DATA } from '@/lib/search/studioHandoff';

// The link's text, dimmed while the data page loads: the link does not
// prefetch, so the page can take a moment to answer the press.
const BackLabel = () => {
    const { pending } = useLinkStatus();

    return <span className={pending ? styles.pending : undefined}>Search the data instead</span>;
};

/**
 * The line above a routed question's transcript: why the search API's router
 * moved it from Get Data, and the way back to a data search of the same
 * question with the router off. The way back is a new history entry, so
 * Back from the data search returns to Studio: an account's saved
 * conversation, or a guest's question as an unsent draft (arrivalDraftHref
 * in src/lib/studio/examples.ts). Neither asks the question again.
 */
const RouteArrival = ({ question, traceId }: { question: string; traceId: string | null }) => (
    <p className={styles.arrival}>
        Moved here from Get Data because it needs analysis.{' '}
        <Link
            href={routeBackHref(question)}
            prefetch={false}
            transitionTypes={[ROUTE_TO_DATA]}
            className={styles.back}
            onClick={() => track('studio.route_back', { traceId })}
        >
            <BackLabel />
        </Link>
    </p>
);

export default RouteArrival;
