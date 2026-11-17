'use client';

import { useState } from 'react';

import { Bridges } from './Bridge';
import { Controls } from './Controls';
import { CountBars } from './CountBars';
import styles from './OdaCounts.module.scss';
import { Scope } from './Scope';
import { Trend } from './Trend';

import type { CountsData, Definition, Prices } from '../_data/types.ts';
import {
    countsFor,
    DEFAULT_DONOR,
    DEFAULT_YEAR,
    findDonor,
    possessive,
    PRELIMINARY_YEAR,
    rangeSentence,
} from '../_lib/counts.ts';

/**
 * The interactive part of the page: the controls, the headline sentence, the counts side
 * by side and the bridges between them, all for one donor, year and price basis.
 */
export const OdaCounts = ({
    data,
    definitions,
}: {
    data: CountsData;
    definitions: Definition[];
}) => {
    const [donorId, setDonorId] = useState(DEFAULT_DONOR);
    const [year, setYear] = useState(DEFAULT_YEAR);
    const [prices, setPrices] = useState<Prices>('current');

    const donor = findDonor(data, donorId) ?? data.donors[0];

    if (donor === undefined) {
        throw new Error('counts.json holds no donors');
    }

    const sentence =
        rangeSentence(donor.name, year, countsFor(data, donor, year, prices)) ??
        `No count of ${possessive(donor.name)} ODA in ${year} is published.`;

    return (
        <div className={styles.island}>
            <Controls
                donors={data.donors}
                donor={donor}
                onDonor={setDonorId}
                years={data.years}
                year={year}
                onYear={setYear}
                baseYear={data.baseYear}
                prices={prices}
                onPrices={setPrices}
            />

            <div className={styles.headline} aria-live="polite">
                <p className={styles.sentence}>{sentence}</p>
                {year === PRELIMINARY_YEAR && (
                    <p className={styles.caveat}>
                        {year} figures are preliminary. The OECD revises them when it publishes the
                        final figures.
                    </p>
                )}
            </div>

            <CountBars
                data={data}
                definitions={definitions}
                donor={donor}
                year={year}
                prices={prices}
            />

            <Bridges data={data} donor={donor} year={year} prices={prices} />

            <Trend data={data} donor={donor} year={year} prices={prices} />

            <Scope data={data} donor={donor} year={year} prices={prices} />
        </div>
    );
};
