'use client';

import { useEffect, useState } from 'react';

export function useInView(ref: React.RefObject<HTMLElement | null>): boolean {
    const [inView, setInView] = useState(false);

    useEffect(() => {
        const el = ref.current;

        if (!el) {
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => setInView(entry.isIntersecting));
        });

        observer.observe(el);

        return () => observer.disconnect();
    }, [ref]);

    return inView;
}
