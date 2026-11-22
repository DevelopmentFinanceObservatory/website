'use client';

import { useEffect, useRef } from 'react';

import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

// `deps`: optional extra values that force a full effect restart. Newly mounted
// reveal elements are picked up automatically via MutationObserver, so most
// callers don't need it.
export function useReveal<T extends HTMLElement>(margin = 12, deps: unknown[] = []) {
    const ref = useRef<T>(null);
    const reducedMotion = usePrefersReducedMotion();

    useEffect(() => {
        const el = ref.current;

        // Under reduced motion the CSS shows everything at once; nothing to observe.
        if (!el || reducedMotion) {
            return;
        }

        // Groups ([data-reveal-group]) are observed as a single element: their inner
        // [data-reveal] children ride on the group's parking, with no observer of their own.
        const collect = () =>
            [
                ...(el.matches('[data-reveal], [data-reveal-group]') ? [el] : []),
                ...el.querySelectorAll<HTMLElement>('[data-reveal], [data-reveal-group]'),
            ].filter(
                (target) =>
                    target.hasAttribute('data-reveal-group') ||
                    target.closest('[data-reveal-group]') === null,
            );

        // The entrance itself is a CSS animation that plays as soon as an element
        // is styled (styles/_reveal.scss); this hook only parks elements so they
        // replay on scroll. An element is parked (hidden, animation none) once it
        // has left the viewport entirely, and unparked when it enters the middle
        // band: two observers, with hysteresis between them. A single band
        // would loop: the parked pose moves the element rem(16) down, so an element
        // on the band's edge would park and unpark forever.
        // The bands are rootMargins, which elements resting exactly on a viewport
        // edge cannot fool the way ratio thresholds can. The flag is an attribute, not a
        // class: React rewrites className wholesale on re-render (e.g. Button's
        // .swapping toggle), which would wipe an observer-added class. An element
        // off screen when first observed played its entrance unseen and is parked
        // by the leave observer's first report; one on screen keeps its entrance.
        const enter = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.removeAttribute('data-reveal-parked');
                    }
                });
            },
            { rootMargin: `-${margin}% 0px -${margin}% 0px`, threshold: 0 },
        );
        const leave = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) {
                        entry.target.setAttribute('data-reveal-parked', '');
                    }
                });
            },
            { rootMargin: '0px', threshold: 0 },
        );

        const observed = new WeakSet<Element>();

        const scan = () => {
            for (const target of collect()) {
                if (!observed.has(target)) {
                    observed.add(target);
                    enter.observe(target);
                    leave.observe(target);
                }
            }
        };

        scan();

        // Content swapped in later (view switches, remounts) must be observed
        // too — the initial scan can't see nodes that don't exist yet.
        const mutations = new MutationObserver(scan);

        mutations.observe(el, { childList: true, subtree: true });

        return () => {
            enter.disconnect();
            leave.disconnect();
            mutations.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is a caller-owned dependency list
    }, [margin, reducedMotion, ...deps]);

    return ref;
}

export const revealIndex = (i: number) => ({ '--i': i }) as React.CSSProperties;
