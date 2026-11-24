'use client';

import { type RefObject, useEffect } from 'react';

/**
 * Grows a textarea to its text in browsers without `field-sizing` (Safari
 * before 26.2, Firefox before 152), which keep it at its `rows`. The
 * stylesheet's `max-height` still caps it. The text, a web font that loads
 * after mount and a window resize (the root font scales with the viewport)
 * each change the height, so each one re-measures. Browsers with
 * `field-sizing` skip it, since an inline height would override the CSS.
 */
export function useGrowFallback(
    ref: RefObject<HTMLElement | null>,
    value: string,
    enabled = true,
): void {
    useEffect(() => {
        const el = ref.current;

        if (
            !enabled ||
            !(el instanceof HTMLTextAreaElement) ||
            CSS.supports('field-sizing', 'content')
        ) {
            return;
        }

        const measure = () => {
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
        };

        measure();
        window.addEventListener('resize', measure);
        document.fonts.addEventListener('loadingdone', measure);

        return () => {
            window.removeEventListener('resize', measure);
            document.fonts.removeEventListener('loadingdone', measure);
        };
    }, [ref, value, enabled]);
}
