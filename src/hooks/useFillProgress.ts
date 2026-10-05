'use client';

import { RefObject, useEffect } from 'react';

import { travelProgress } from '@/utils/scroll';

// Per-frame lerp factor: the displayed progress chases the scroll target, so
// the fill trails the scroll a touch instead of tracking it 1:1.
const SMOOTHING = 0.12;
const EPSILON = 0.0005;

// Drives --fill-progress on the ref element from its scroll travel, smoothed.
// The rAF loop runs only while the value is still catching up.
export function useFillProgress(ref: RefObject<HTMLElement | null>, enabled: boolean) {
    useEffect(() => {
        if (!enabled) {
            return;
        }

        let frame = 0;
        let running = false;
        let current: number | null = null;

        const tick = () => {
            const el = ref.current;

            if (!el) {
                running = false;

                return;
            }

            const target = travelProgress(el.getBoundingClientRect(), window.innerHeight);

            // First frame snaps (no sweep-in on load); afterwards chase the target.
            current = current === null ? target : current + (target - current) * SMOOTHING;

            if (Math.abs(target - current) < EPSILON) {
                current = target;
            }

            el.style.setProperty('--fill-progress', current.toFixed(4));

            if (current === target) {
                running = false;

                return;
            }

            frame = requestAnimationFrame(tick);
        };

        const start = () => {
            if (!running) {
                running = true;
                frame = requestAnimationFrame(tick);
            }
        };

        start();
        window.addEventListener('scroll', start, { passive: true });
        window.addEventListener('resize', start);

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('scroll', start);
            window.removeEventListener('resize', start);
        };
    }, [ref, enabled]);
}
