import { useEffect, useState } from 'react';

import { GRID_CELL } from '@/components/atoms/GridPattern/GridPattern';
import { PHONE_QUERY } from '@/hooks/useMediaQuery';

// On a phone the sheet is as wide as the screen: the cell shrinks so the
// widest card kind (22 cells — charts, tables) fits between the canvas'
// insets. Never below this, or card type stops fitting its cells.
const PHONE_MIN_CELL = 14;
const PHONE_CARD_CELLS = 22;
const PHONE_INSETS = 20;

/**
 * The whiteboard cell in real px. The site scales fluidly through the root
 * font-size (html { font-size: vw(16) }) — the cells must ride the same
 * factor, or fixed-px cards fall out of proportion against their rem-sized
 * content on wider screens. On phones the cell fits the screen instead.
 */
export const useGridCell = (): number => {
    const [cell, setCell] = useState(GRID_CELL);

    useEffect(() => {
        let raf = 0;

        const measure = () => {
            const base = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
            const fluid = (GRID_CELL * base) / 16;

            if (window.matchMedia(PHONE_QUERY).matches) {
                const fit = Math.floor((window.innerWidth - PHONE_INSETS) / PHONE_CARD_CELLS);

                setCell(Math.max(PHONE_MIN_CELL, Math.min(fluid, fit)));

                return;
            }

            setCell(fluid);
        };

        const queue = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(measure);
        };

        measure();
        window.addEventListener('resize', queue);

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', queue);
        };
    }, []);

    return cell;
};
