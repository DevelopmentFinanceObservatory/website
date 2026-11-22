'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { useAidFigures } from './AidProse';
import { CountrySearch } from './CountrySearch';
import { CountryTable, FAILED } from './CountryTable';
import styles from './HivFinancing.module.scss';
import { PerPersonStrip } from './PerPersonStrip';
import { ProviderBars } from './ProviderBars';
import { Reserved } from './Reserved';
import { UnaidsStatus } from './UnaidsStatus';
import { READ_AID_LIVE } from './useAid';
import { useUnaids } from './useUnaids';

import type { HivData, UnaidsFigures } from '../_data/types.ts';
import {
    aidSections,
    allSentence,
    countrySentence,
    flagLegend,
    stripCaption,
    tableRule,
    unallocatedCaption,
} from '../_lib/copy.ts';
import { islandTier } from '../_lib/aid.ts';
import { lastYear, PER_PERSON_MIN_PLHIV, scopeMulti, scopeSeries } from '../_lib/summary.ts';
import { joinUnaids } from '../_lib/unaids.ts';

import { tierAttribute } from '#lib/liveRead.ts';

const ALL_COUNTRIES = 'All countries';

/**
 * Stand-in UNAIDS figures that print each clause of a country's sentence in its longest form:
 * treatment coverage, deaths over 100,000, and a head count in millions. The opening's ratio
 * is longest at the fewest people the page gives a ratio for, so a second stand-in takes that
 * head count. The sentence reserves their room before the reads land, so the page below stays
 * put when the figures arrive.
 */
const standIns = (years: readonly number[]): UnaidsFigures[] =>
    [8_888_888, PER_PERSON_MIN_PLHIV].map((plhiv) => ({
        plhiv,
        art: 100,
        deaths: years.map((_, index) => (index === 0 ? 888_888 : 999_888)),
    }));

const chartTitle = (name: string, data: HivData) =>
    `${name}, ${data.years[0]} to ${data.years.at(-1)}, constant ${data.priceBase} US dollars`;

/** An in-page scroll's behaviour: instant under reduced motion, otherwise smooth. `auto`
 *  would defer to the site's `scroll-behavior: smooth` on the root and so scroll smoothly
 *  under reduced motion. */
const scrollBehaviour = (): ScrollBehavior =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';

/**
 * The interactive part of the page: the scope row, the summary sentence, the bars and the
 * per-person strip, and the country table. Choosing the selected country again from a dot
 * or a row returns to all countries; choosing it in the search keeps it.
 *
 * The aid figures are hiv.json's, or DFO's newest stored ones when the page reads them live
 * (useAid, held by AidProvider for the island and the prose around it). The UNAIDS figures
 * come from the browser reads (useUnaids). Until they arrive, or when they fail, a country's
 * sentence leaves out its per-person, treatment and deaths clauses, the strip gives way to a
 * status line in the strip's room, and the table's UNAIDS columns wait. The sentence reserves room for those clauses from the first paint.
 */
export const HivFinancing = () => {
    const [selected, setSelected] = useState<string | null>(null);
    const islandRef = useRef<HTMLDivElement>(null);
    const topRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLElement>(null);
    const aid = useAidFigures();
    const { data } = aid;
    const unaids = useUnaids(data.countries, data.years);
    const countries = useMemo(
        () =>
            joinUnaids(
                data.countries,
                unaids.status === 'ready' ? unaids.figures : null,
                data.years,
            ),
        [data, unaids],
    );
    const chosen =
        selected === null ? undefined : countries.find((country) => country.iso3 === selected);
    const [chartSection, tableSection] = aidSections(data);
    const year = lastYear(data);

    const sentence = chosen === undefined ? allSentence(data) : countrySentence(chosen, data.years);
    const title = chartTitle(chosen?.name ?? ALL_COUNTRIES, data);
    // Every text a scope can show, so the sentence and the chart title take the room of
    // their longest at any width and a change of scope never moves the page below.
    const variants = useMemo(
        () => ({
            sentences: [
                allSentence(data),
                ...countries.map((country) => countrySentence(country, data.years)),
                ...standIns(data.years).flatMap((figures) =>
                    data.countries.map((country) =>
                        countrySentence({ ...country, ...figures }, data.years),
                    ),
                ),
            ],
            titles: [ALL_COUNTRIES, ...countries.map((country) => country.name)].map((name) =>
                chartTitle(name, data),
            ),
        }),
        [data, countries],
    );

    // Text fades in on each change of scope after first paint (_motion.scss).
    useEffect(() => {
        islandRef.current?.setAttribute('data-ready', '');
    }, []);

    const toggle = (iso3: string) => setSelected((current) => (current === iso3 ? null : iso3));

    const onRow = (iso3: string) => {
        const opening = selected !== iso3;

        toggle(iso3);

        if (opening) {
            topRef.current?.scrollIntoView({ block: 'start', behavior: scrollBehaviour() });
        }
    };

    // Collapsing the table from the foot of its full length brings its heading back into view.
    const onCollapse = () => {
        const table = tableRef.current;

        if (table !== null && table.getBoundingClientRect().top < 0) {
            table.scrollIntoView({ block: 'start', behavior: scrollBehaviour() });
        }
    };

    return (
        <div
            ref={islandRef}
            className={styles.island}
            data-read-tier={islandTier(aid.tier, tierAttribute(unaids))}
            data-read-live={String(READ_AID_LIVE)}
        >
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
                        countries={countries}
                        chosen={chosen}
                        year={year}
                        onChoose={setSelected}
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
                <ProviderBars
                    series={scopeSeries(data, selected)}
                    multi={scopeMulti(data, selected)}
                    years={data.years}
                    scope={selected ?? ALL_COUNTRIES}
                />
                <p className={styles.note}>{unallocatedCaption(data)}</p>
                <div className={styles.below} data-waiting={unaids.status !== 'ready'}>
                    {unaids.status === 'ready' ? (
                        <PerPersonStrip
                            countries={countries}
                            year={year}
                            caption={stripCaption(countries, year)}
                            selected={selected}
                            onSelect={toggle}
                        />
                    ) : (
                        <UnaidsStatus state={unaids} what="the strip of aid per person" />
                    )}
                </div>
            </section>

            <section
                ref={tableRef}
                className={`${styles.section} ${styles.tableSection}`}
                aria-labelledby={tableSection.id}
            >
                <h2 id={tableSection.id} className={styles.heading}>
                    {tableSection.title}
                </h2>
                <p className={styles.rule}>{tableRule(data)}</p>
                <UnaidsStatus
                    state={unaids}
                    what="the UNAIDS columns"
                    announce
                    failed={`The table marks their figures "${FAILED}".`}
                />
                <CountryTable
                    countries={countries}
                    unaids={unaids.status}
                    year={year}
                    legend={flagLegend(data)}
                    selected={selected}
                    onSelect={onRow}
                    onCollapse={onCollapse}
                />
            </section>
        </div>
    );
};
