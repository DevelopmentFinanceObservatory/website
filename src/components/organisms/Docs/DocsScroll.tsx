'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

// The same distance the headings keep for their anchors (Docs.module.scss),
// so arriving at a page and jumping to a heading land alike. Design pixels:
// the root font scales, and the gap should scale with it.
const OFFSET = 100;

/**
 * The nav tree navigates without Next's jump to the top of the document (see
 * DocsTree), which on this page means jumping above a 452px banner and away
 * from the text. This puts the reader at the start of the new page instead.
 *
 * Nothing moves unless the banner is already behind them: on a fresh load the
 * article sits well below the offset, so the test fails and the page is left
 * alone, and a URL carrying a hash is left to the browser, whose target wins.
 */
const DocsScroll = ({ target }: { target: string }) => {
    const pathname = usePathname();
    const reduced = usePrefersReducedMotion();

    useEffect(() => {
        const article = document.getElementById(target);

        if (!article || window.location.hash) {
            return;
        }

        const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const offset = (OFFSET * root) / 16;
        const { top } = article.getBoundingClientRect();

        if (top >= offset) {
            return;
        }

        window.scrollTo({
            top: window.scrollY + top - offset,
            behavior: reduced ? 'auto' : 'smooth',
        });
    }, [pathname, target, reduced]);

    return null;
};

export default DocsScroll;
