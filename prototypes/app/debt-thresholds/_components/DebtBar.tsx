import { THRESHOLDS } from '../_lib/thresholds.ts';

import styles from './DebtBar.module.scss';

import type { Capacity } from '../_data/types.ts';

const HEIGHT = 34;
const MAX = 100;
const CAPACITIES = ['weak', 'medium', 'strong'] as const satisfies Capacity[];

/** Width the value label needs before it moves inside the bar's end. */
const LABEL_ROOM = 34;

/**
 * The country's own value at the end of its bar, or just inside the end when the bar
 * runs to the edge. A white halo keeps it legible over the threshold line.
 */
const ValueLabel = ({ value, end, width }: { value: number; end: number; width: number }) => {
    const inside = end + 4 + LABEL_ROOM > width;

    return (
        <text
            x={inside ? end - 10 : end + 4}
            y={14}
            textAnchor={inside ? 'end' : 'start'}
            className={styles.valueLabel}
        >
            {value.toFixed(0)}%
        </text>
    );
};

/**
 * External public debt in % of GDP on a 0 to 100 track, against the weak-to-strong
 * threshold range, with the active capacity's threshold marked and the country's value
 * printed at the end of its bar. Drawn at `width` pixels.
 */
export const DebtBar = ({
    value,
    capacity,
    width,
}: {
    value: number | null;
    capacity: Capacity | null;
    width: number;
}) => {
    if (width <= 0) {
        return <div style={{ height: HEIGHT }} aria-hidden="true" />;
    }

    const x = (v: number) => 1 + (Math.min(Math.max(v, 0), MAX) / MAX) * (width - 2);
    const range = { from: x(THRESHOLDS.debt.weak), to: x(THRESHOLDS.debt.strong) };

    return (
        <svg
            className={styles.bar}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            width={width}
            height={HEIGHT}
            aria-hidden="true"
        >
            <rect x={1} y={4} width={width - 2} height={12} className={styles.track} />
            <rect
                x={range.from}
                y={4}
                width={range.to - range.from}
                height={12}
                className={styles.range}
            />
            {value !== null && (
                <rect
                    x={1}
                    y={6}
                    width={x(value) - 1}
                    height={8}
                    rx={1.5}
                    className={styles.value}
                />
            )}
            {value !== null && value > MAX && (
                <path
                    d={`M${width - 6},${6} L${width - 2},${10} L${width - 6},${14}`}
                    className={styles.arrow}
                />
            )}
            {value !== null && <ValueLabel value={value} end={x(value)} width={width} />}
            {capacity !== null && (
                <line
                    x1={x(THRESHOLDS.debt[capacity])}
                    x2={x(THRESHOLDS.debt[capacity])}
                    y1={1}
                    y2={19}
                    className={styles.threshold}
                />
            )}
            {CAPACITIES.map((level) => (
                <text
                    key={level}
                    x={x(THRESHOLDS.debt[level])}
                    y={31}
                    textAnchor="middle"
                    className={level === capacity ? styles.tickActive : styles.tick}
                >
                    {THRESHOLDS.debt[level]}%
                </text>
            ))}
        </svg>
    );
};
