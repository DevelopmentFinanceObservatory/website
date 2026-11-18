import { CardFoot, SourceLine } from './CardFoot';
import styles from './CountDots.module.scss';
import { COUNT_COLOURS } from './colours';
import { Caret, SideDetails, WithSide } from './SideColumn';
import { useStill, useWidth } from './useWidth';

import type { CountKey, CountsData, Definition, Donor, Offer, Prices } from '../_data/types.ts';
import {
    COUNT_LABELS,
    countDefinition,
    countsFor,
    type CountValue,
    dotLabelBoxes,
    dotTicks,
    formatAmount,
    formatCompact,
    formatTick,
    GRANT_EQUIVALENT_FROM,
    headlineBasis,
    headlineLabel,
    layoutLabels,
    missingText,
    ODA_GNI_TARGET,
    type PlacedLabel,
    possessive,
    priceDefinition,
} from '../_lib/counts.ts';
import {
    COMMITTED_CURRENCY,
    currencyNoun,
    unitPhrase,
    unitTitle,
    type Unit,
} from '../_lib/live.ts';

/** The plot's inner margin, so a dot at either end of the axis is drawn whole. */
const PAD = 12;
/** Label rows in pixels: the strip between axis and first row, a box, the pitch of rows. */
const ROWS = { lead: 22, height: 38, pitch: 44 };
/** The strip above or below the axis on a side with no labels. */
const EMPTY_SIDE = 18;
const DOT_RADIUS = 6.5;
const RING_RADIUS = 11.5;
/** The counts the band spans: the disbursement counts. */
const BAND: readonly CountKey[] = ['gross', 'net', 'grantEquivalent'];

/** A translate in pixels; dots, labels and the band move by it, so they glide. */
const at = (x: number, y: number): string => `translate(${x}px, ${y}px)`;

const sentenceCase = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** A definition as quoted: led by its term unless `bare`, ending in a link to the OECD where it quotes the OECD. */
const Quote = ({ part, bare = false }: { part: Definition; bare?: boolean }) => (
    <>
        {!bare && (
            <>
                <dfn>{sentenceCase(part.label)}</dfn>:{' '}
            </>
        )}
        {part.description}
        {part.source === 'oecd' && part.url !== undefined && (
            <>
                {' '}
                <a href={part.url}>OECD</a>
            </>
        )}
    </>
);

/** Where text sits in a label box: towards the side its leader enters. */
const alignOf = ({ left, width, leaderX }: PlacedLabel): 'left' | 'center' | 'right' => {
    const at = ((leaderX ?? left + width / 2) - left) / width;

    return at < 0.3 ? 'left' : at > 0.7 ? 'right' : 'center';
};

const Swatch = ({ count, hollow = false }: { count: CountKey; hollow?: boolean }) => (
    <span
        className={count === 'headline' || hollow ? styles.swatchHollow : styles.swatch}
        style={
            count === 'headline' || hollow
                ? { borderColor: COUNT_COLOURS[count] }
                : { background: COUNT_COLOURS[count] }
        }
        aria-hidden="true"
    />
);

/**
 * One dot per published count on one axis, which starts above zero where the counts sit
 * well above it, the disbursement counts' range as a pale band, and the OECD headline as
 * a ring on the count it follows. Each dot's label sits above or below the axis where
 * `layoutLabels` puts it, joined by a leader.
 */
const DotPlot = ({
    counts,
    ticks,
    year,
    currency,
    description,
}: {
    counts: CountValue[];
    /** the donor-year's ticks over both price bases, so switching prices holds the scale */
    ticks: number[];
    year: number;
    currency: string;
    description: string;
}) => {
    const [ref, width] = useWidth();
    const low = ticks[0] ?? 0;
    const high = ticks.at(-1) ?? 1;
    const xOf = (value: number): number =>
        PAD + ((value - low) / (high - low)) * Math.max(0, width - 2 * PAD);

    const placed =
        width > 0
            ? layoutLabels({ labels: dotLabelBoxes(counts, year, xOf, currency), width })
            : [];
    const tiers = (side: PlacedLabel['side']) =>
        Math.max(0, ...placed.filter((label) => label.side === side).map(({ tier }) => tier + 1));
    const span = (count: number) =>
        count === 0 ? EMPTY_SIDE : ROWS.lead + ROWS.height + (count - 1) * ROWS.pitch;
    const axisY = span(tiers('above'));
    const tickY = axisY + span(tiers('below')) + 6;
    const height = tickY + 16;
    const boxTop = ({ side, tier }: PlacedLabel): number =>
        side === 'above'
            ? axisY - ROWS.lead - tier * ROWS.pitch - ROWS.height
            : axisY + ROWS.lead + tier * ROWS.pitch;

    const band = counts.flatMap(({ key, value }) =>
        BAND.includes(key) && value !== null ? [xOf(value)] : [],
    );
    const valueOf = (key: CountKey) => counts.find((count) => count.key === key)?.value ?? null;
    const headline = valueOf('headline');

    return (
        <div ref={ref} className={styles.plot} role="img" aria-label={description}>
            {width > 0 && (
                <>
                    <svg
                        className={styles.svg}
                        width={width}
                        height={height}
                        viewBox={`0 0 ${width} ${height}`}
                        aria-hidden="true"
                    >
                        {ticks.map((tick) => (
                            <line
                                key={tick}
                                x1={xOf(tick)}
                                x2={xOf(tick)}
                                y1={0}
                                y2={tickY - 2}
                                className={styles.grid}
                            />
                        ))}
                        <line x1={0} x2={width} y1={axisY} y2={axisY} className={styles.axis} />
                        {band.length > 1 && (
                            <rect
                                width={1}
                                height={DOT_RADIUS * 2}
                                className={styles.band}
                                style={{
                                    transform: `${at(Math.min(...band), axisY - DOT_RADIUS)} scaleX(${Math.max(...band) - Math.min(...band)})`,
                                }}
                            />
                        )}
                        {placed.map((label) => {
                            if (label.leaderX === null) {
                                return null;
                            }

                            const reach = label.id === 'headline' ? RING_RADIUS : DOT_RADIUS;
                            const toward = label.side === 'above' ? -1 : 1;
                            const top = boxTop(label);

                            const d = `M${label.x},${axisY + toward * (reach + 1)}L${label.leaderX},${label.side === 'above' ? top + ROWS.height : top}`;

                            // The path's `d` as a style too, so browsers that animate it glide.
                            return (
                                <path
                                    key={label.id}
                                    d={d}
                                    className={styles.leader}
                                    style={{ d: `path("${d}")` }}
                                />
                            );
                        })}
                        {headline !== null && (
                            <circle
                                r={RING_RADIUS}
                                style={{ transform: at(xOf(headline), axisY) }}
                                stroke={COUNT_COLOURS.headline}
                                className={styles.ring}
                            />
                        )}
                        {counts.map(({ key, value }) =>
                            key === 'headline' || value === null ? null : (
                                <circle
                                    key={key}
                                    r={DOT_RADIUS}
                                    style={{ transform: at(xOf(value), axisY) }}
                                    fill={COUNT_COLOURS[key]}
                                    className={styles.dot}
                                />
                            ),
                        )}
                    </svg>

                    {placed.map((label) => {
                        const count = counts.find(({ key }) => key === label.id);

                        if (count === undefined) {
                            return null;
                        }

                        const { key, value } = count;

                        return (
                            <span
                                key={label.id}
                                className={label.side === 'above' ? styles.above : styles.below}
                                style={{
                                    transform: at(label.left, boxTop(label)),
                                    width: label.width,
                                    height: ROWS.height,
                                    textAlign: alignOf(label),
                                }}
                                aria-hidden="true"
                            >
                                {key === 'headline' ? (
                                    <span className={styles.headlineName}>
                                        {headlineLabel(year)}
                                    </span>
                                ) : (
                                    <>
                                        <span className={styles.name}>{COUNT_LABELS[key]}</span>
                                        <span key={value ?? 'none'} className={styles.value}>
                                            {value === null ? '' : formatCompact(value, currency)}
                                        </span>
                                    </>
                                )}
                            </span>
                        );
                    })}

                    {ticks.map((tick, index) => (
                        <span
                            key={tick}
                            className={
                                index === 0
                                    ? styles.tickFirst
                                    : index === ticks.length - 1
                                      ? styles.tickLast
                                      : styles.tick
                            }
                            style={{ left: xOf(tick), top: tickY }}
                            aria-hidden="true"
                        >
                            {formatTick(tick, currency)}
                        </span>
                    ))}
                </>
            )}
        </div>
    );
};

/**
 * Every count of a donor's ODA in a year: a dot plot on one axis, then one row per count
 * that opens to its full definition, with notes on reading it in the side column.
 */
export const CountDots = ({
    data,
    definitions,
    donor,
    year,
    unit,
    lead,
    offer,
}: {
    data: CountsData;
    definitions: Definition[];
    donor: Donor;
    year: number;
    unit: Unit;
    /** the price basis the axes hold to, or null for both */
    lead: Prices | null;
    offer: Offer;
}) => {
    const { prices, currency } = unit;
    const counts = countsFor(data, donor, year, prices);
    const ticks = dotTicks(data, donor, year, lead);
    const still = useStill<HTMLElement>();
    const phrase = unitPhrase(unit, offer);
    const price = priceDefinition(prices, definitions);
    const description =
        `Dot plot of ${possessive(donor.name)} ODA in ${year} by count, in ${phrase}. ` +
        counts
            .map(
                ({ key, value }) =>
                    `${COUNT_LABELS[key]} ${value === null ? missingText(data, donor, key, year, prices) : formatAmount(value, currency)}`,
            )
            .join('; ') +
        `. The OECD headline follows ${COUNT_LABELS[headlineBasis(year)].toLowerCase()} in ${year}.`;

    return (
        <section ref={still} id="counts" className={styles.card} aria-labelledby="counts-title">
            <h2 id="counts-title" className={styles.title}>
                {possessive(donor.name)} ODA in {year} by count, {phrase}
            </h2>
            <WithSide
                side={
                    <>
                        <SideDetails title="How to read this">
                            <p>
                                Each dot is one count of the same donor&apos;s ODA in the same year,
                                on one scale, which need not start at zero. The band spans the
                                disbursement counts. The ring marks the count the OECD headline
                                follows. Open a row for the count&apos;s full definition.
                            </p>
                            <p>
                                To compare donors, or to test a donor against the UN target of{' '}
                                {ODA_GNI_TARGET}% of gross national income, use the OECD headline.
                                Do not compare the headline across {GRANT_EQUIVALENT_FROM}, when its
                                basis switched from net disbursements to grant equivalents.
                            </p>
                            <p>
                                To see how much money left the donor in a year, use gross
                                disbursements, or net disbursements to deduct repayments.
                            </p>
                            <p>
                                Commitments are firm obligations to provide aid, and can run ahead
                                of or behind disbursements.
                            </p>
                        </SideDetails>
                        <SideDetails title={unitTitle(unit, offer)}>
                            <p>
                                <Quote part={price} bare />
                            </p>
                            {currency !== COMMITTED_CURRENCY && (
                                <p>
                                    {prices === 'constant'
                                        ? `Figures in constant ${unit.baseYear} ${currencyNoun(offer, currency)} convert each year's US-dollar figure to the donor's own currency at that year's exchange rate, deflate it to ${unit.baseYear} prices with the donor's price deflator, and convert it to ${currencyNoun(offer, currency)} at the ${unit.baseYear} exchange rate.`
                                        : `Figures in current ${currencyNoun(offer, currency)} are each year's US-dollar figures converted at that year's exchange rate.`}{' '}
                                    Deflators and exchange rates come from ONE&apos;s conversion
                                    tables.
                                </p>
                            )}
                        </SideDetails>
                    </>
                }
            >
                <DotPlot
                    counts={counts}
                    ticks={ticks}
                    year={year}
                    currency={currency}
                    description={description}
                />
                <div className={styles.rows}>
                    {counts.map(({ key, value }) => {
                        const parts = countDefinition(key, definitions);

                        return (
                            <details key={key} className={styles.row}>
                                <summary className={styles.summary}>
                                    <Caret />
                                    <Swatch count={key} hollow={value === null} />
                                    <span className={styles.rowName}>
                                        {COUNT_LABELS[key]}
                                        {key === 'headline' && (
                                            <span className={styles.basis}>
                                                {' '}
                                                ({COUNT_LABELS[
                                                    headlineBasis(year)
                                                ].toLowerCase()}{' '}
                                                in {year})
                                            </span>
                                        )}
                                    </span>
                                    <span className={styles.gloss}>{parts[0]?.description}</span>
                                    <span
                                        key={value ?? 'none'}
                                        className={
                                            value === null ? styles.rowMissing : styles.rowValue
                                        }
                                    >
                                        {value === null
                                            ? missingText(data, donor, key, year, prices)
                                            : formatCompact(value, currency)}
                                    </span>
                                </summary>
                                <div className={styles.rowBody}>
                                    {parts.map((part) => (
                                        <p key={part.id}>
                                            <Quote part={part} />
                                        </p>
                                    ))}
                                </div>
                            </details>
                        );
                    })}
                </div>
            </WithSide>
            <CardFoot>
                <SourceLine />
            </CardFoot>
        </section>
    );
};
