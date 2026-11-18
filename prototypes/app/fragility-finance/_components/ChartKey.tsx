import styles from './ChartKey.module.scss';

export type KeyRow = {
    key: string;
    label: string;
    colour: string;
    value: string;
    /** How many contexts the figure covers, where fewer than all: "48 of 62". */
    note?: string;
    /** A dashed swatch, for a series drawn dashed. */
    dashed?: boolean;
    /** The row shows a figure from another year, so it sits back. */
    dimmed?: boolean;
};

/** A chart's key for one year: a swatch, a name and the value for each series. */
export const ChartKey = ({ year, rows }: { year: number; rows: readonly KeyRow[] }) => (
    <div className={styles.key}>
        <p className={styles.year} aria-hidden="true">
            {year}
        </p>
        <ul className={styles.list}>
            {rows.map((row) => (
                <li key={row.key} className={styles.item} data-dimmed={row.dimmed === true}>
                    <span
                        className={row.dashed === true ? styles.swatchDashed : styles.swatch}
                        style={
                            row.dashed === true
                                ? { borderColor: row.colour }
                                : { background: row.colour }
                        }
                    />
                    <span className={styles.name}>
                        <span key={row.label} className={styles.fade}>
                            {row.label}
                        </span>
                        {row.note !== undefined && (
                            <span key={row.note} className={styles.note}>
                                {' '}
                                {row.note}
                            </span>
                        )}
                    </span>
                    <span key={row.value} className={styles.value}>
                        {row.value}
                    </span>
                </li>
            ))}
        </ul>
    </div>
);
