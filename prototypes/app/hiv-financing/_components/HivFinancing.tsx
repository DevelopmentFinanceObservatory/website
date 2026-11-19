'use client';

import { useMemo, useRef, useState } from 'react';

import { CountrySearch } from './CountrySearch';
import { CountryTable } from './CountryTable';
import styles from './HivFinancing.module.scss';
import { PerPersonStrip } from './PerPersonStrip';
import { ProviderBars } from './ProviderBars';
import { Reserved } from './Reserved';

import type { HivData } from '../_data/types.ts';
import { allSentence, countrySentence } from '../_lib/copy.ts';
import { money } from '../_lib/format.ts';
import { findCountry, lastTotal, LAST_YEAR, scopeSeries } from '../_lib/summary.ts';

export type Section = { id: string; title: string };

const ALL_COUNTRIES = 'All countries';

const chartTitle = (name: string, years: readonly number[]) =>
    `${name}, ${years[0]} to ${years.at(-1)}, US dollars`;

/**
 * The interactive part of the page: the scope row, the summary sentence, the bars and the
 * per-person strip, and the country table. Choosing the selected country again, from a dot,
 * a row or the search, returns to all countries.
 */
export const HivFinancing = ({
    data,
    sections,
}: {
    data: HivData;
    /** The rail's entries for the chart section and the table section, in that order. */
    sections: readonly [Section, Section];
}) => {
    const [selected, setSelected] = useState<string | null>(null);
    const topRef = useRef<HTMLDivElement>(null);
    const chosen = selected === null ? undefined : findCountry(data, selected);
    const [chartSection, tableSection] = sections;

    const sentence = chosen === undefined ? allSentence(data) : countrySentence(chosen, data.years);
    const title = chartTitle(chosen?.name ?? ALL_COUNTRIES, data.years);
    // Every text a scope can show, so the sentence and the chart title take the room of
    // their longest at any width and a change of scope never moves the page below.
    const variants = useMemo(
        () => ({
            sentences: [
                allSentence(data),
                ...data.countries.map((country) => countrySentence(country, data.years)),
            ],
            titles: [ALL_COUNTRIES, ...data.countries.map((country) => country.name)].map((name) =>
                chartTitle(name, data.years),
            ),
        }),
        [data],
    );

    const toggle = (iso3: string) => setSelected((current) => (current === iso3 ? null : iso3));

    const onRow = (iso3: string) => {
        const opening = selected !== iso3;

        toggle(iso3);

        if (opening) {
            const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            topRef.current?.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
        }
    };

    return (
        <div className={styles.island}>
            <div ref={topRef} className={styles.top}>
                <div className={styles.controls}>
                    <button
                        type="button"
                        className={styles.all}
                        aria-pressed={selected === null}
                        onClick={() => setSelected(null)}
                    >
                        {ALL_COUNTRIES}
                    </button>
                    <CountrySearch
                        countries={data.countries}
                        chosen={chosen}
                        onChoose={toggle}
                        onClear={() => setSelected(null)}
                    />
                </div>
                <p className={styles.sentence} aria-live="polite">
                    <Reserved text={sentence} variants={variants.sentences} block />
                </p>
            </div>

            <section className={styles.section} aria-labelledby={chartSection.id}>
                <h2 id={chartSection.id} className={styles.heading}>
                    {chartSection.title}
                </h2>
                <h3 className={styles.chartTitle}>
                    <Reserved text={title} variants={variants.titles} block />
                </h3>
                <ProviderBars series={scopeSeries(data, selected)} years={data.years} />
                <p className={styles.note} data-hidden={chosen !== undefined}>
                    Not shown: {money(lastTotal(data.unallocated))} in {LAST_YEAR} reported for
                    regions or no country.
                </p>
                <div className={styles.below}>
                    <PerPersonStrip
                        countries={data.countries}
                        selected={selected}
                        onSelect={toggle}
                    />
                </div>
            </section>

            <section className={styles.section} aria-labelledby={tableSection.id}>
                <h2 id={tableSection.id} className={styles.heading}>
                    {tableSection.title}
                </h2>
                <CountryTable countries={data.countries} selected={selected} onSelect={onRow} />
            </section>
        </div>
    );
};
