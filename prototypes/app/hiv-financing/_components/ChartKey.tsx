import type { CSSProperties } from 'react';

import styles from './ChartKey.module.scss';

export type KeyRow = {
    key: string;
    label: string;
    /** The swatch's colour; a row without one, such as a total, sits under a rule. */
    colour?: string;
    /** Draws the swatch hatched in `colour`, as the chart draws money only partly in scope. */
    hatched?: boolean;
    /** A short line under the label, such as "Not in the total". */
    note?: string;
    value: string;
};

/** A swatch hatched at 45 degrees in `colour`, matching the chart's hatch pattern. */
export const hatchBackground = (colour: string): string =>
    `repeating-linear-gradient(-45deg, ${colour} 0 2px, #fff 2px 5px)`;

/** A hatched swatch's style: the hatch and a hairline outline in `colour`. */
export const hatchSwatch = (colour: string): CSSProperties => ({
    background: hatchBackground(colour),
    boxShadow: `inset 0 0 0 1px ${colour}`,
});

const swatchStyle = (row: KeyRow): CSSProperties | undefined => {
    if (row.colour === undefined) {
        return undefined;
    }

    return row.hatched === true ? hatchSwatch(row.colour) : { background: row.colour };
};

const rowClass = (row: KeyRow): string | undefined => {
    if (row.colour === undefined) {
        return styles.total;
    }

    return row.hatched === true ? styles.outside : styles.item;
};

/** A chart's key for one year: a swatch, a name and the value for each series. */
export const ChartKey = ({ year, rows }: { year: number; rows: readonly KeyRow[] }) => (
    <div className={styles.key}>
        <p className={styles.year} aria-hidden="true">
            {year}
        </p>
        <ul className={styles.list}>
            {rows.map((row) => (
                <li key={row.key} className={rowClass(row)}>
                    <span className={styles.swatch} style={swatchStyle(row)} />
                    <span className={styles.name}>
                        {row.label}
                        {row.note !== undefined && <span className={styles.note}>{row.note}</span>}
                    </span>
                    <span key={row.value} className={styles.value}>
                        {row.value}
                    </span>
                </li>
            ))}
        </ul>
    </div>
);
