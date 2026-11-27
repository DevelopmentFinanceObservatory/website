'use client';

import { useEffect, useState } from 'react';

import { IS_SITE } from '@/lib/site';

/**
 * Whether the signed-in viewer is an admin, from GET /api/account/admin,
 * asked once while `enabled`. False until the answer arrives, when it fails,
 * and in the prototypes app, which has no such route. It decides only what
 * is shown, and each admin route checks the caller itself.
 */
export const useAdmin = (enabled: boolean): boolean => {
    const [admin, setAdmin] = useState(false);

    useEffect(() => {
        if (!enabled || !IS_SITE) {
            return;
        }

        let live = true;

        fetch('/api/account/admin', { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : { admin: false }))
            .then(
                (body: { admin?: unknown }) => live && setAdmin(body.admin === true),
                () => undefined,
            );

        return () => {
            live = false;
        };
    }, [enabled]);

    return enabled && admin;
};
