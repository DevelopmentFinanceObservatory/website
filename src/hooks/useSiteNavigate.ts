'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { IS_SITE, siteHref } from '@/lib/site';

/**
 * Goes to a page of the main site: a client-side push on the website, a full
 * page load of the absolute URL in the prototypes app, whose router would
 * prefix its basePath and whose static export holds no site page.
 */
export const useSiteNavigate = (): ((path: string) => void) => {
    const router = useRouter();

    return useCallback(
        (path: string) => {
            if (IS_SITE) {
                router.push(path);
            } else {
                window.location.assign(siteHref(path));
            }
        },
        [router],
    );
};
