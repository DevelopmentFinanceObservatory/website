'use client';

import { useState } from 'react';

import { Bridges } from './Bridge';
import { Controls } from './Controls';
import { CountDots } from './CountDots';
import { useLiveUnits } from './LiveUnits';
import styles from './OdaCounts.module.scss';
import { Scope } from './Scope';
import { Trend } from './Trend';

import type { CountsData, Definition } from '../_data/types.ts';
import {
    countsFor,
    DEFAULT_YEAR,
    findDonor,
    possessive,
    PRELIMINARY_YEAR,
    rangeSentence,
} from '../_lib/counts.ts';

/**
 * The interactive part of the page: the controls, the headline sentence, the counts on one
 * axis and the bridges between them, all for one donor, year and unit. While the picked
 * donor or unit loads, the panels keep the previous figures, dimmed.
 */
export const OdaCounts = ({
    data,
    definitions,
}: {
    data: CountsData;
    definitions: Definition[];
}) => {
    const [year, setYear] = useState(DEFAULT_YEAR);
    const { offer, picked, shown, donor, pending, failed, pickDonor, pickUnit } = useLiveUnits();
    const { unit } = shown;
    const pickedDonor = findDonor(data, picked.donorId) ?? donor;

    const sentence =
        rangeSentence(donor.name, year, countsFor(data, donor, year, unit.prices), unit.currency) ??
        `No disbursement figure of ${possessive(donor.name)} ODA in ${year} is published.`;

    return (
        <div className={styles.island}>
            <Controls
                donors={data.donors}
                donor={pickedDonor}
                onDonor={pickDonor}
                years={data.years}
                year={year}
                onYear={setYear}
                offer={offer}
                unit={picked.unit}
                onUnit={pickUnit}
                failed={failed}
            />

            <div className={styles.figures} data-pending={pending} aria-busy={pending}>
                <div className={styles.headline} aria-live="polite">
                    <p className={styles.sentence}>{sentence}</p>
                    {year === PRELIMINARY_YEAR && (
                        <p className={styles.caveat}>
                            {year} figures are preliminary. The OECD revises them when it publishes
                            the final figures.
                        </p>
                    )}
                </div>

                <CountDots
                    data={data}
                    definitions={definitions}
                    donor={donor}
                    year={year}
                    unit={unit}
                    offer={offer}
                />

                <Bridges data={data} donor={donor} year={year} unit={unit} />

                <Trend data={data} donor={donor} year={year} unit={unit} offer={offer} />

                <Scope data={data} donor={donor} year={year} unit={unit} />
            </div>
        </div>
    );
};
