'use client';

import { useSyncExternalStore } from 'react';

// The SCSS breakpoints (src/styles/_breakpoints.scss), for the few places
// where the layout itself changes shape and JS has to know.
export const PHONE_QUERY = '(max-width: 659px)';
export const TABLET_QUERY = '(min-width: 660px) and (max-width: 1023px)';

/**
 * A live media query match (false on the server and during hydration).
 */
export const useMediaQuery = (query: string): boolean =>
    useSyncExternalStore(
        (onChange) => {
            const media = window.matchMedia(query);

            media.addEventListener('change', onChange);

            return () => media.removeEventListener('change', onChange);
        },
        () => window.matchMedia(query).matches,
        () => false,
    );

export const useIsPhone = () => useMediaQuery(PHONE_QUERY);
