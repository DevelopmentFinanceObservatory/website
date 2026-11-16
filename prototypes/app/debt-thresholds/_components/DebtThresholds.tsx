'use client';

import { useRef, useState, useSyncExternalStore } from 'react';

import { CardFoot } from './CardFoot';
import { CountryCard, DownloadCsv, EmptyCountryCard, SourceLine } from './CountryCard';
import { CountrySearch } from './CountrySearch';
import styles from './DebtThresholds.module.scss';
import { NetTransfers } from './NetTransfers';
import { Summary } from './Summary';
import { GROUP_COLOURS, ThresholdScatter, type ScatterPoint } from './ThresholdScatter';

import type { Capacity, Country, ThresholdsData } from '../_data/types.ts';
import {
    classify,
    debtRatio,
    effectiveCapacity,
    endYear,
    FDL_GROUPS,
    FDL_YEAR,
    fdlCounts,
    fdlMatch,
    GROUP_PHRASES,
    groupCounts,
    isFdlView,
    listOf,
    movers,
    peakService,
    shownGroup,
    type CapacityOverride,
    THRESHOLDS,
    type Group,
} from '../_lib/thresholds.ts';
import { ticksTo } from '../_lib/scale.ts';
import { groupTransfers, transfersHeading, type TransfersData } from '../_lib/transfers.ts';

const CAPACITY_OPTIONS = [
    { value: 'assessed', label: 'As assessed' },
    { value: 'weak', label: 'All weak' },
    { value: 'medium', label: 'All medium' },
    { value: 'strong', label: 'All strong' },
] as const satisfies { value: CapacityOverride; label: string }[];

/** When FDL published the groups its view shows. */
const FDL_PUBLISHED = 'March 2026';
const MOVERS_NAMED = 6;

// The selected country lives in the URL hash (#KEN), so a link opens on it. Writing
// with replaceState fires no hashchange, so writes notify subscribers themselves.
const hashListeners = new Set<() => void>();

const subscribeHash = (listener: () => void) => {
    hashListeners.add(listener);
    window.addEventListener('hashchange', listener);

    return () => {
        hashListeners.delete(listener);
        window.removeEventListener('hashchange', listener);
    };
};

const readHash = (): string => decodeURIComponent(window.location.hash.slice(1)).toUpperCase();

/** Writes the selection to the hash; an empty code clears it. */
const writeHash = (iso3: string) => {
    const { pathname, search } = window.location;

    window.history.replaceState(null, '', iso3 === '' ? `${pathname}${search}` : `#${iso3}`);
    hashListeners.forEach((listener) => listener());
};

const Segmented = <TValue extends string | number>({
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

const LegendItem = ({ group, text }: { group: Group; text: string }) => (
    <span>
        <span className={styles.swatch} style={{ background: GROUP_COLOURS[group] }} />
        {text}
    </span>
);

const MoversSentence = ({ countries }: { countries: Country[] | null }) => {
    if (countries === null) {
        return <>Showing each country&apos;s capacity as assessed by the IMF and World Bank.</>;
    }

    if (countries.length === 0) {
        return <>No country changes group.</>;
    }

    const named = countries.slice(0, MOVERS_NAMED);
    const lead =
        countries.length === 1
            ? '1 country changes group: '
            : countries.length > named.length
              ? `${countries.length} countries change group, including `
              : `${countries.length} countries change group: `;

    return (
        <>
            {lead}
            {named.map((country, index) => (
                <span key={country.iso3}>
                    {index > 0 && ', '}
                    <b>{country.name}</b>
                </span>
            ))}
            .
        </>
    );
};

/**
 * Whose counts the summary shows and on which data. In FDL's view with assessed
 * capacity they are FDL's; otherwise the DFO's, with FDL's published count beside them
 * and the capacity what-if named.
 */
const ownerLine = (year: number, override: CapacityOverride, countries: Country[]): string => {
    if (year === FDL_YEAR && override === 'assessed') {
        return `FDL's published groups, ${FDL_PUBLISHED}.`;
    }

    const fdl = fdlCounts(countries);
    const whatIf = override === 'assessed' ? '' : `, if every country had ${override} capacity`;
    const published = listOf([fdl.debt, fdl.service, fdl.below].map(String));

    return `DFO estimate on ${year} data${whatIf}. FDL's published count on ${FDL_YEAR} data: ${published}.`;
};

/**
 * The tooltip line for a dot whose FDL colour sits on the other side of a threshold: in
 * FDL's view, where FDL's published group and the DFO's rebuild disagree.
 */
const rebuildNote = (country: Country, year: number, override: CapacityOverride): string | null => {
    if (!isFdlView(country, year, override) || country.fdl2024 === null) {
        return null;
    }

    const fdl = FDL_GROUPS[country.fdl2024];
    const rebuilt = classify(country, year, effectiveCapacity(country, year, override));

    return rebuilt === fdl
        ? null
        : `FDL places this country ${GROUP_PHRASES[fdl]}. The DFO's rebuild places it ${GROUP_PHRASES[rebuilt]}.`;
};

/**
 * The note under the summary for one view and capacity: whose counts these are and, in
 * FDL's year, how far the DFO's rebuild matches FDL's groups, with the countries that differ.
 */
const viewNote = (countries: Country[], year: number, override: CapacityOverride): string => {
    const owner = ownerLine(year, override, countries);

    if (year !== FDL_YEAR) {
        return owner;
    }

    const { matched, total, mismatches } = fdlMatch(countries);
    const match = `The DFO's rebuild of ${FDL_YEAR} matches FDL for ${matched} of ${total} countries.`;

    if (mismatches.length === 0) {
        return `${owner} ${match}`;
    }

    const names = listOf(mismatches.map(({ country }) => country.name));
    const dots =
        override === 'assessed'
            ? " Their dots show FDL's group at the DFO's position, so some sit on the other side of a threshold."
            : '';

    return `${owner} ${match} It differs for ${names}.${dots}`;
};

/**
 * Every view and capacity's note in one grid cell, so the cell is as tall as the longest
 * and the charts below stay put when the view or capacity changes.
 */
const ViewNotes = ({
    countries,
    years,
    year,
    override,
}: {
    countries: Country[];
    years: number[];
    year: number;
    override: CapacityOverride;
}) => (
    <div className={styles.stacked}>
        {years.flatMap((view) =>
            CAPACITY_OPTIONS.map(({ value }) => {
                const isShown = view === year && value === override;

                return (
                    <p key={`${view}-${value}`} data-shown={isShown} aria-hidden={!isShown}>
                        {viewNote(countries, view, value)}
                    </p>
                );
            }),
        )}
    </div>
);

/**
 * Axis ticks for the scatter, covering every country in every view and the strong
 * thresholds, so the axes stay put when the view changes and both threshold bands show.
 */
const scatterTicks = (data: ThresholdsData): { x: number[]; y: number[] } => {
    let debtMax: number = THRESHOLDS.debt.strong;
    let peakMax: number = THRESHOLDS.service.strong;

    for (const country of data.countries) {
        for (const year of data.baseYears) {
            const base = country.bases[String(year)];

            if (base !== undefined) {
                debtMax = Math.max(debtMax, debtRatio(base) ?? 0);
                peakMax = Math.max(peakMax, peakService(base)?.ratio ?? 0);
            }
        }
    }

    return { x: ticksTo(debtMax), y: ticksTo(peakMax) };
};

/**
 * The interactive part of the page: group counts and the view switch, the scatter with
 * the capacity what-if, the selected country's card, and net transfers by group. FDL's
 * view (base year 2024) shows FDL's published groups; the latest view applies FDL's test
 * to the newest base year. The selection is kept in the URL hash as the country's ISO3
 * code; with none, the card asks the reader to pick a country.
 */
export const DebtThresholds = ({
    data,
    transfers,
}: {
    data: ThresholdsData;
    transfers: TransfersData;
}) => {
    const { countries } = data;
    const ticks = scatterTicks(data);
    const [year, setYear] = useState(data.defaultYear);
    const [override, setOverride] = useState<CapacityOverride>('assessed');
    const hash = useSyncExternalStore(subscribeHash, readHash, () => '');

    const groups = new Map(
        countries.map((country) => [country.iso3, shownGroup(country, year, override)]),
    );
    const groupOf = (iso3: string): Group | null => groups.get(iso3) ?? null;
    const vintage = data.vintages[String(year)];
    const isFdlYear = year === FDL_YEAR;
    const showsFdl = isFdlYear && override === 'assessed';

    const counts = groupCounts(countries, year, override);
    const points: ScatterPoint[] = [];
    let lastYear = year;

    for (const country of countries) {
        const group = groupOf(country.iso3) ?? 'nodata';
        const base = country.bases[String(year)];
        const debt = base === undefined ? null : debtRatio(base);
        const peak = base === undefined ? null : peakService(base);
        const capacity = effectiveCapacity(country, year, override);

        lastYear = base === undefined ? lastYear : Math.max(lastYear, endYear(base));

        if (debt !== null && peak !== null) {
            points.push({
                iso3: country.iso3,
                name: country.name,
                group,
                debt,
                peak: peak.ratio,
                capacity,
                note: rebuildNote(country, year, override),
            });
        }
    }

    const selected = countries.find((country) => country.iso3 === hash);
    // The search always shows a country; a dot clicked again clears the selection.
    const countrySlot = useRef<HTMLDivElement>(null);
    // The card sits under the scatter, so a dot clicked brings the card's top into view
    // when it starts below the window.
    const reveal = () =>
        requestAnimationFrame(() => {
            const slot = countrySlot.current;

            if (slot !== null && slot.getBoundingClientRect().top > window.innerHeight - 120) {
                const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

                slot.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
            }
        });
    const choose = (iso3: string) => {
        writeHash(iso3);
        reveal();
    };
    const select = (iso3: string) => {
        const next = iso3 === selected?.iso3 ? '' : iso3;

        writeHash(next);
        if (next !== '') {
            reveal();
        }
    };
    const capacityOverride: Capacity | null = override === 'assessed' ? null : override;
    const search = (
        <CountrySearch
            label={selected === undefined ? 'Find a country' : 'Find another country'}
            options={countries.map(({ iso3, name }) => ({
                iso3,
                name,
                group: groupOf(iso3) ?? 'nodata',
            }))}
            onChoose={choose}
        />
    );
    const { lines: transferLines } = groupTransfers(transfers, groupOf);
    const groupSource = showsFdl
        ? `FDL, ${FDL_PUBLISHED}`
        : `DFO, ${year} data${override === 'assessed' ? '' : `, all ${override} capacity`}`;

    const viewOptions = data.baseYears.map((value) => ({
        value,
        label: value === FDL_YEAR ? `FDL, ${value} data` : `DFO, ${value} data`,
    }));

    return (
        <div id="groups" className={styles.island}>
            <Summary
                counts={counts}
                owner={
                    <ViewNotes
                        countries={countries}
                        years={data.baseYears}
                        year={year}
                        override={override}
                    />
                }
                viewSwitch={
                    <Segmented label="View" options={viewOptions} value={year} onChange={setYear} />
                }
            />

            <div className={styles.tool}>
                <div className={styles.chartCard}>
                    <p className={styles.title}>
                        External public debt at face value against peak debt service, {year} to{' '}
                        {lastYear}
                    </p>
                    <div className={styles.whatIf}>
                        <span>Debt-carrying capacity</span>
                        <Segmented
                            label="Debt-carrying capacity"
                            options={CAPACITY_OPTIONS}
                            value={override}
                            onChange={setOverride}
                        />
                    </div>
                    {/* Every view and capacity's sentence sits in one grid cell, so the cell is
                        as tall as the longest and nothing below moves when the choice changes. */}
                    <div className={`${styles.stacked} ${styles.moved}`}>
                        {data.baseYears.flatMap((view) =>
                            CAPACITY_OPTIONS.map(({ value }) => {
                                const isShown = view === year && value === override;

                                return (
                                    <p
                                        key={`${view}-${value}`}
                                        data-shown={isShown}
                                        aria-hidden={!isShown}
                                    >
                                        <MoversSentence
                                            countries={
                                                value === 'assessed'
                                                    ? null
                                                    : movers(countries, view, value)
                                            }
                                        />
                                    </p>
                                );
                            }),
                        )}
                    </div>
                    <div className={styles.legend}>
                        <LegendItem group="debt" text="Above the debt threshold" />
                        <LegendItem group="service" text="Above the debt-service threshold" />
                        <LegendItem group="below" text="Below both" />
                        {counts.nodata > 0 && <LegendItem group="nodata" text="No data" />}
                        <span>
                            <span className={`${styles.swatch} ${styles.rangeSwatch}`} />
                            Threshold range, weak to strong capacity
                        </span>
                    </div>
                    <ThresholdScatter
                        points={points}
                        xTicks={ticks.x}
                        yTicks={ticks.y}
                        selected={selected?.iso3 ?? null}
                        override={capacityOverride}
                        onSelect={select}
                    />
                    <div className={styles.actions}>
                        <DownloadCsv countries={countries} year={year} override={override} />
                    </div>
                    <CardFoot>
                        {vintage !== undefined && (
                            <SourceLine ids={vintage.ids} weo={vintage.weo} />
                        )}
                    </CardFoot>
                </div>

                <div ref={countrySlot} className={styles.countrySlot}>
                    {selected === undefined ? (
                        <EmptyCountryCard search={search} />
                    ) : (
                        <CountryCard
                            country={selected}
                            year={year}
                            override={override}
                            vintage={vintage}
                            search={search}
                        />
                    )}
                </div>

                <section className={styles.transfers} aria-labelledby="net-transfers">
                    <h2 id="net-transfers" className={styles.sectionHeading}>
                        {transfersHeading(transferLines, transfers.years)}
                    </h2>
                    <p className={styles.sectionLede}>
                        Net transfers are loans received minus repayments and interest,{' '}
                        {transfers.years[0]} to {transfers.years.at(-1)}. The lines group countries
                        as the chart above does and follow its view and capacity controls. Below
                        zero, a group pays its creditors more than it borrows.
                    </p>
                    <NetTransfers
                        data={transfers}
                        groupOf={groupOf}
                        groupSource={groupSource}
                        highlight={selected === undefined ? null : groupOf(selected.iso3)}
                    />
                </section>
            </div>
        </div>
    );
};
