'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
    return useSyncExternalStore(
        (onChange) => {
            const media = window.matchMedia(QUERY);

            media.addEventListener('change', onChange);

            return () => media.removeEventListener('change', onChange);
        },
        () => window.matchMedia(QUERY).matches,
        () => false,
    );
}
