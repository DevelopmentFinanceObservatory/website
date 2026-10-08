'use client';

import { useEffect, useState } from 'react';

/**
 * Whole seconds left until `at` (a `Date.now()` moment), rounded up, counting
 * down once a second and 0 from then on. 0 when `at` is undefined.
 */
export const useSecondsUntil = (at: number | undefined): number => {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (at === undefined) {
            return;
        }

        const timer = window.setInterval(() => {
            const moment = Date.now();

            setNow(moment);

            if (moment >= at) {
                window.clearInterval(timer);
            }
        }, 1000);

        return () => window.clearInterval(timer);
    }, [at]);

    return at === undefined ? 0 : Math.max(0, Math.ceil((at - now) / 1000));
};
