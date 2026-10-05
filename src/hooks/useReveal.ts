'use client';

import { useEffect, useRef } from 'react';

// `deps`: optional extra values that force a full effect restart. Newly mounted
// reveal elements are picked up automatically via MutationObserver, so most
// callers don't need it.
export function useReveal<T extends HTMLElement>(margin = 12, deps: unknown[] = []) {
    const ref = useRef<T>(null);

    useEffect(() => {
        const el = ref.current;

        if (!el) {
            return;
        }

        // Groups ([data-reveal-group]) are observed as a single element — their inner
        // [data-reveal] children ride on the group's class instead of their own observer.
        const collect = () =>
            [
                ...(el.matches('[data-reveal], [data-reveal-group]') ? [el] : []),
                ...el.querySelectorAll<HTMLElement>('[data-reveal], [data-reveal-group]'),
            ].filter(
                (target) =>
                    target.hasAttribute('data-reveal-group') ||
                    target.closest('[data-reveal-group]') === null,
            );

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // Each element reveals when IT enters the middle band of the viewport and resets
        // only once it has left the viewport entirely — two observers, with hysteresis
        // between them. One band for both used to loop: the hidden state translates the
        // element rem(16) down (and the entrance overshoots), so an element resting on
        // the band's top edge kept sliding in and out of it, revealing and resetting
        // forever. Band-based (rootMargin) instead of ratio thresholds — immune to
        // elements resting exactly on a viewport edge. The revealed flag is an attribute,
        // not a class: React rewrites className wholesale on re-render (e.g. Button's
        // .swapping toggle), which would wipe an observer-added class.
        const enter = reduced
            ? null
            : new IntersectionObserver(
                  (entries) => {
                      entries.forEach((entry) => {
                          if (entry.isIntersecting) {
                              entry.target.setAttribute('data-revealed', '');
                          }
                      });
                  },
                  { rootMargin: `-${margin}% 0px -${margin}% 0px`, threshold: 0 },
              );
        const leave = reduced
            ? null
            : new IntersectionObserver(
                  (entries) => {
                      entries.forEach((entry) => {
                          if (!entry.isIntersecting) {
                              entry.target.removeAttribute('data-revealed');
                          }
                      });
                  },
                  { rootMargin: '0px', threshold: 0 },
              );

        const observed = new WeakSet<Element>();

        const scan = () => {
            for (const target of collect()) {
                if (reduced) {
                    target.setAttribute('data-revealed', '');
                } else if (!observed.has(target)) {
                    observed.add(target);
                    enter!.observe(target);
                    leave!.observe(target);
                }
            }
        };

        scan();

        // Content swapped in later (view switches, remounts) must be observed
        // too — the initial scan can't see nodes that don't exist yet.
        const mutations = new MutationObserver(scan);

        mutations.observe(el, { childList: true, subtree: true });

        return () => {
            enter?.disconnect();
            leave?.disconnect();
            mutations.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is a caller-owned dependency list
    }, [margin, ...deps]);

    return ref;
}

export const revealIndex = (i: number) => ({ '--i': i }) as React.CSSProperties;
