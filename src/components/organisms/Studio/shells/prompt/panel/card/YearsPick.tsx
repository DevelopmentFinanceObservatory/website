import styles from './CardPage.module.scss';

import type { WindowOffer } from '@/lib/studio/wire';

const span = (window: WindowOffer): number[] =>
    Array.from(
        { length: window.last_year - window.first_year + 1 },
        (_, index) => window.first_year + index,
    );

/**
 * The years picker's choices: `From` and `To` as native selects over every
 * year the card's data spans, or one `Year` select for a card that shows one
 * value per series (`single`), which sets both ends. A year with no data
 * cannot start or end the range, so it is disabled.
 */
const YearsPick = ({
    window,
    from,
    to,
    onChange,
}: {
    window: WindowOffer;
    from: number;
    to: number;
    onChange: (from: number, to: number) => void;
}) => {
    const missing = new Set(window.missing_years ?? []);
    const years = span(window);
    const options = years.map((year) => (
        <option key={year} value={year} disabled={missing.has(year)}>
            {year}
        </option>
    ));

    if (window.single) {
        return (
            <div className={styles.yearsPick}>
                <label className={styles.pickField}>
                    <span className={styles.pickLabel}>Year</span>
                    <select
                        className={styles.select}
                        value={from}
                        data-pick-focus
                        onChange={(event) => {
                            const year = Number(event.target.value);

                            onChange(year, year);
                        }}
                    >
                        {options}
                    </select>
                </label>
            </div>
        );
    }

    return (
        <div className={styles.yearsPick}>
            <label className={styles.pickField}>
                <span className={styles.pickLabel}>From</span>
                <select
                    className={styles.select}
                    value={from}
                    data-pick-focus
                    onChange={(event) => onChange(Number(event.target.value), to)}
                >
                    {options}
                </select>
            </label>
            <label className={styles.pickField}>
                <span className={styles.pickLabel}>To</span>
                <select
                    className={styles.select}
                    value={to}
                    onChange={(event) => onChange(from, Number(event.target.value))}
                >
                    {options}
                </select>
            </label>
            {from > to && <p className={styles.pickNote}>The range ends before it starts.</p>}
        </div>
    );
};

export default YearsPick;
