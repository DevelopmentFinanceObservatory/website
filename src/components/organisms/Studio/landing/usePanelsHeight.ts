'use client';

import { type RefObject, useEffect, useState } from 'react';

/**
 * The landing panels' box reserves the TALLER panel's height (measured —
 * both stay mounted in grid-rows accordions), so the centred stage never
 * shifts as they swap. Re-measured on resize and whenever a list inside
 * changes without resizing the clipped box.
 */
export const usePanelsHeight = (refs: RefObject<HTMLDivElement | null>[]) => {
    const [height, setHeight] = useState(0);

    useEffect(() => {
        const nodes = refs
            .map((ref) => ref.current)
            .filter((node): node is HTMLDivElement => !!node);

        if (nodes.length === 0) {
            return;
        }

        const measure = () => setHeight(Math.max(...nodes.map((node) => node.scrollHeight)));
        const observer = new ResizeObserver(measure);

        nodes.forEach((node) => observer.observe(node));
        const mutations = new MutationObserver(measure);

        nodes.forEach((node) => mutations.observe(node, { childList: true, subtree: true }));

        return () => {
            observer.disconnect();
            mutations.disconnect();
        };
        // The refs are stable objects; the nodes are read on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return height;
};
