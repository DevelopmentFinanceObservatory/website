'use client';

import { useId } from 'react';

import styles from './Controls.module.scss';
import { DonorSearch } from './DonorSearch';

import type { Donor, Prices } from '../_data/types.ts';
import { PRELIMINARY_YEAR } from '../_lib/counts.ts';

const Segmented = <TValue extends string>({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: readonly { value: TValue; label: string }[];
    value: TValue;
    onChange: (value: TValue) => void;
}) => (
    <span className={styles.seg} role="group" aria-label={label}>
        {options.map((option) => (
            <button
                key={option.value}
                type="button"
                aria-pressed={option.value === value}
                onClick={() => onChange(option.value)}
            >
                {option.label}
            </button>
        ))}
    </span>
);

const yearText = (year: number): string =>
    year === PRELIMINARY_YEAR ? `${year} (preliminary)` : String(year);

/** The donor, year and price basis every panel on the page follows. */
export const Controls = ({
    donors,
    donor,
    onDonor,
    years,
    year,
    onYear,
    baseYear,
    prices,
    onPrices,
}: {
    donors: Donor[];
    donor: Donor;
    onDonor: (id: string) => void;
    years: number[];
    year: number;
    onYear: (year: number) => void;
    baseYear: number;
    prices: Prices;
    onPrices: (prices: Prices) => void;
}) => {
    const yearId = useId();

    return (
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
            <Segmented
                label="Prices"
                options={[
                    { value: 'current', label: 'Current US dollars' },
                    { value: 'constant', label: `Constant ${baseYear} US dollars` },
                ]}
                value={prices}
                onChange={onPrices}
            />
        </div>
    );
};
