'use client';

import { useId } from 'react';

import styles from './Controls.module.scss';
import { DonorSearch } from './DonorSearch';
import type { Failure } from './LiveUnits';
import { UnitPicker } from './UnitPicker';

import type { Donor, Offer } from '../_data/types.ts';
import { PRELIMINARY_YEAR } from '../_lib/counts.ts';
import type { Unit } from '../_lib/live.ts';

const yearText = (year: number): string =>
    year === PRELIMINARY_YEAR ? `${year} (preliminary)` : String(year);

/**
 * The donor, year and unit every panel on the page follows, and under them one line when
 * the figures could not be converted live.
 */
export const Controls = ({
    donors,
    donor,
    onDonor,
    years,
    year,
    onYear,
    offer,
    unit,
    onUnit,
    failed,
}: {
    donors: Donor[];
    donor: Donor;
    onDonor: (id: string) => void;
    years: number[];
    year: number;
    onYear: (year: number) => void;
    offer: Offer;
    unit: Unit;
    onUnit: (unit: Unit) => void;
    failed: Failure | null;
}) => {
    const yearId = useId();

    return (
        <div className={styles.bar}>
            <div className={styles.controls}>
                <DonorSearch donors={donors} selected={donor} onChoose={onDonor} />
                <span className={styles.control}>
                    <label htmlFor={yearId}>Year</label>
                    <span className={styles.slider}>
                        <input
                            id={yearId}
                            type="range"
                            className={styles.range}
                            min={years[0]}
                            max={years.at(-1)}
                            step={1}
                            value={year}
                            aria-valuetext={yearText(year)}
                            onChange={(event) => onYear(Number(event.target.value))}
                        />
                    </span>
                    <output htmlFor={yearId} className={styles.year}>
                        {yearText(year)}
                    </output>
                </span>
                <UnitPicker offer={offer} unit={unit} onPick={onUnit} />
            </div>
            <p className={styles.failure} role="status">
                {failed === 'rate_limited'
                    ? 'Too many figures were converted in the last minute. Try again shortly.'
                    : failed === 'error' && 'The figures could not be converted live.'}
            </p>
        </div>
    );
};
