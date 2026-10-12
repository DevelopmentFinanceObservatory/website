'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import styles from './Docs.module.scss';

import { PHONE_QUERY } from '@/hooks/useMediaQuery';

export function DocsDisclosure({ children }: { children: ReactNode }) {
    const detailsRef = useRef<HTMLDetailsElement>(null);

    useEffect(() => {
        const details = detailsRef.current;

        if (!details) return;

        const phone = window.matchMedia(PHONE_QUERY);
        const syncDisclosure = () => {
            // WebKit hides a closed disclosure from assistive technology even
            // when CSS makes its contents visible. Open the actual element.
            details.open = !phone.matches;
            details.toggleAttribute('data-column', !phone.matches);
        };

        syncDisclosure();
        phone.addEventListener('change', syncDisclosure);

        return () => phone.removeEventListener('change', syncDisclosure);
    }, []);

    return (
        <details ref={detailsRef} className={styles.tree}>
            <summary className={styles.treeSummary}>Contents</summary>
            {children}
        </details>
    );
}
