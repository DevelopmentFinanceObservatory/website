'use client';

import { useEffect, useState } from 'react';

import { siteHref } from '@/lib/site';

/**
 * Whether LIBRARY_ENABLED is on, asked of the running server at GET
 * /api/library/enabled. A page prerendered at build time carries the build's
 * environment, so the answer comes in the browser. Null until it arrives,
 * and when the request fails.
 */
export const useLibraryEnabled = (): boolean | null => {
    const [enabled, setEnabled] = useState<boolean | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        const ask = async () => {
            try {
                const response = await fetch(siteHref('/api/library/enabled'), {
                    signal: controller.signal,
                });
                const body: unknown = response.ok ? await response.json() : null;

                if (typeof body === 'object' && body !== null && 'enabled' in body) {
                    setEnabled(body.enabled === true);
                }
            } catch {
                // Aborted on unmount, or unreachable: the answer stays null.
            }
        };

        void ask();

        return () => controller.abort();
    }, []);

    return enabled;
};
