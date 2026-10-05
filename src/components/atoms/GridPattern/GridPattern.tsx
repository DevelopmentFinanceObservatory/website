import classNames from 'classnames';
import { useId } from 'react';

import styles from './GridPattern.module.scss';

export type GridPatternProps = {
    variant?: 'light' | 'dark';
    className?: string;
    // Cell size in px — the whiteboard passes the fluid-scaled cell so its
    // grid rides the root font-size; decorative layers keep the 20px default.
    cell?: number;
};

export const GRID_CELL = 20;

const DOT = 1;

const GridPattern = ({ variant = 'dark', className, cell = GRID_CELL }: GridPatternProps) => {
    const patternId = useId().replace(/:/g, '');
    const CELL = cell;
    // Intersection dots scale with the cell so a fluid grid keeps its texture.
    const HALF_DOT = (DOT * (cell / GRID_CELL)) / 2;

    return (
        <svg className={classNames(styles.pattern, styles[variant], className)} aria-hidden="true">
            <defs>
                <pattern id={patternId} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
                    {/* Edge halves merge across tiles into 1px lines centered on cell boundaries. */}
                    <path
                        className={styles.line}
                        d={`M0 0V${CELL}M${CELL} 0V${CELL}M0 0H${CELL}M0 ${CELL}H${CELL}`}
                    />
                    <rect className={styles.dot} x="0" y="0" width={HALF_DOT} height={HALF_DOT} />
                    <rect
                        className={styles.dot}
                        x={CELL - HALF_DOT}
                        y="0"
                        width={HALF_DOT}
                        height={HALF_DOT}
                    />
                    <rect
                        className={styles.dot}
                        x="0"
                        y={CELL - HALF_DOT}
                        width={HALF_DOT}
                        height={HALF_DOT}
                    />
                    <rect
                        className={styles.dot}
                        x={CELL - HALF_DOT}
                        y={CELL - HALF_DOT}
                        width={HALF_DOT}
                        height={HALF_DOT}
                    />
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#${patternId})`} />
        </svg>
    );
};

export default GridPattern;
