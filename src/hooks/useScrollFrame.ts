'use client';

import { useEffect } from 'react';

// rAF-throttled scroll/resize driver. Pass null to disable (e.g. reduced motion).
export function useScrollFrame(update: (() => void) | null) {
    useEffect(() => {
        if (!update) {
            return;
        }

        let frame = 0;

        const request = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(update);
        };

        request();
        window.addEventListener('scroll', request, { passive: true });
        window.addEventListener('resize', request);

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('scroll', request);
            window.removeEventListener('resize', request);
        };
    }, [update]);
}
