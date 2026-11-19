import styles from './ChartKey.module.scss';

export type KeyRow = {
    key: string;
    label: string;
    /** The swatch's colour; a row without one, such as a total, sits under a rule. */
    colour?: string;
    value: string;
};

/** A chart's key for one year: a swatch, a name and the value for each series. */
export const ChartKey = ({ year, rows }: { year: number; rows: readonly KeyRow[] }) => (
    <div className={styles.key}>
        <p className={styles.year} aria-hidden="true">
            {year}
        </p>
        <ul className={styles.list}>
            {rows.map((row) => (
                <li key={row.key} className={row.colour === undefined ? styles.total : styles.item}>
                    <span
                        className={styles.swatch}
                        style={row.colour === undefined ? undefined : { background: row.colour }}
                    />
                    <span className={styles.name}>{row.label}</span>
                    <span key={row.value} className={styles.value}>
                        {row.value}
                    </span>
                </li>
            ))}
        </ul>
    </div>
);
