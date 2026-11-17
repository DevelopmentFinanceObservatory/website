import styles from './Bridge.module.scss';
import { CardFoot, SourceLine } from './CardFoot';
import { COUNT_COLOURS, STEP_OPACITY } from './colours';
import { SideDetails, WithSide } from './SideColumn';
import { useStill } from './useWidth';

import type { CountsData, Donor, Prices } from '../_data/types.ts';
import {
    bridge,
    type BridgeBar,
    bridgeBars,
    BRIDGE_COUNTS,
    type BridgeKey,
    COUNT_LABELS,
    donorTicks,
    formatCompact,
    formatTick,
    GRANT_EQUIVALENT_FROM,
    nonGrantSentence,
    possessive,
    riseNote,
} from '../_lib/counts.ts';
import type { Unit } from '../_lib/live.ts';

const BRIDGES: readonly BridgeKey[] = ['toNet', 'toGrantEquivalent'];

/** A step's change with its sign, as the chart prints it: "+$1.4B", "−€3.6B". */
const signed = (millions: number, currency: string): string =>
    millions > 0
        ? `+${formatCompact(millions, currency)}`
        : formatCompact(millions, currency).replace('-', '−');

/** One bridge as one bar: the count solid, the step to gross disbursements pale. */
const BarRow = ({
    bar,
    percent,
    currency,
}: {
    bar: BridgeBar;
    percent: (amount: number) => number;
    currency: string;
}) => {
    const solid = percent(Math.min(bar.value, bar.gross));
    const end = percent(Math.max(bar.value, bar.gross));
    const colour = COUNT_COLOURS[bar.target];

    return (
        <>
            <div className={styles.head} style={{ width: `max(${end}%, min(100%, 260px))` }}>
                <span className={styles.target}>
                    {COUNT_LABELS[bar.target]}{' '}
                    <b key={bar.value} className={styles.figure}>
                        {formatCompact(bar.value, currency)}
                    </b>
                </span>
                <span key={bar.step.label} className={styles.step}>
                    {bar.step.label}{' '}
                    <b key={bar.step.value} className={styles.figure}>
                        {signed(bar.step.value, currency)}
                    </b>
                </span>
            </div>
            {/* Both parts span the track and scale from its left edge, so they grow and glide. */}
            <div className={styles.track} aria-hidden="true">
                <span style={{ transform: `scaleX(${solid / 100})`, background: colour }} />
                <span
                    style={{
                        transform: `translateX(${solid}%) scaleX(${(end - solid) / 100})`,
                        background: colour,
                        opacity: STEP_OPACITY,
                    }}
                />
            </div>
        </>
    );
};

/**
 * Why the counts differ: gross disbursements to net disbursements and to grant
 * equivalents, one bar each on a shared axis with gross disbursements as a vertical
 * line. A bridge without its figures says why in one line in place of its bar.
 */
export const Bridges = ({
    data,
    donor,
    year,
    unit,
    lead,
}: {
    data: CountsData;
    donor: Donor;
    year: number;
    unit: Unit;
    /** the price basis the axes hold to, or null for both */
    lead: Prices | null;
}) => {
    const { prices, currency } = unit;
    const steps = bridge(data, donor, year, prices);
    const bars = bridgeBars(steps);
    const nonGrants = nonGrantSentence(steps.toGrantEquivalent, currency);
    const rises = BRIDGES.flatMap((key) => riseNote(key, steps) ?? []);
    const whose = possessive(donor.name);
    const missing: Record<BridgeKey, string> = {
        toNet: `${whose} gross or net figure for ${year} is not published.`,
        toGrantEquivalent:
            year < GRANT_EQUIVALENT_FROM
                ? `The OECD's headline counts grant equivalents from ${GRANT_EQUIVALENT_FROM}, so this bridge starts then.`
                : `${whose} grant-equivalent figure for ${year} is not published.`,
    };

    const gross = BRIDGES.flatMap((key) => bars[key]?.gross ?? [])[0] ?? null;
    const still = useStill();
    const ticks = donorTicks(data, donor, BRIDGE_COUNTS, lead);
    const top = ticks.at(-1) ?? 1;
    const percent = (amount: number): number => (Math.min(Math.max(amount, 0), top) / top) * 100;

    return (
        <section className={styles.bridges} aria-labelledby="why-they-differ">
            <h2 id="why-they-differ" className={styles.heading}>
                Why they differ
            </h2>
            <p className={styles.lede}>
                Net disbursements deduct repayments and other amounts received from gross
                disbursements. Grant equivalents count non-grant instruments only for their
                concessional part, and count private sector instruments and debt relief on a
                different basis. That gap can therefore exceed non-grant instruments or turn
                negative.
            </p>
            <div ref={still} className={styles.card}>
                <h3 className={styles.title}>
                    From gross disbursements to net disbursements and to grant equivalents
                </h3>
                <WithSide
                    side={
                        <>
                            <SideDetails title="How to read this">
                                <p>
                                    Each bar is one count, on one scale with gross disbursements,
                                    the vertical line. The pale part is the step between the count
                                    and gross disbursements.
                                </p>
                                <p>
                                    Net disbursements deduct loan repayments and other amounts the
                                    donor received. Grant equivalents count grants in full and
                                    non-grant instruments only for their concessional part. They
                                    also count private sector instruments and debt relief on a
                                    different basis from gross disbursements.
                                </p>
                            </SideDetails>
                            <SideDetails title="How the steps are computed">
                                <p>
                                    Amounts received are gross minus net disbursements. The DFO
                                    publishes no separate series for them.
                                </p>
                                {nonGrants !== null && <p>{nonGrants}</p>}
                            </SideDetails>
                        </>
                    }
                >
                    <div className={styles.chart}>
                        {gross !== null && (
                            <div className={styles.lines} aria-hidden="true">
                                {ticks.map((tick) => (
                                    <span
                                        key={tick}
                                        className={styles.grid}
                                        style={{ left: `${percent(tick)}%` }}
                                    />
                                ))}
                                <span
                                    className={styles.gross}
                                    style={{ transform: `translateX(${percent(gross)}%)` }}
                                />
                            </div>
                        )}
                        {gross !== null && (
                            <p className={styles.grossRow}>
                                <span
                                    className={styles.grossAt}
                                    style={{ transform: `translateX(${percent(gross)}%)` }}
                                >
                                    <span
                                        className={
                                            percent(gross) > 50
                                                ? styles.grossLeft
                                                : styles.grossRight
                                        }
                                    >
                                        {COUNT_LABELS.gross}{' '}
                                        <b key={gross} className={styles.figure}>
                                            {formatCompact(gross, currency)}
                                        </b>
                                    </span>
                                </span>
                            </p>
                        )}
                        <ul className={styles.rows}>
                            {BRIDGES.map((key) => {
                                const bar = bars[key];

                                return (
                                    <li key={key} className={styles.row}>
                                        {bar === null ? (
                                            <p className={styles.missing}>{missing[key]}</p>
                                        ) : (
                                            <BarRow
                                                bar={bar}
                                                percent={percent}
                                                currency={currency}
                                            />
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                        {gross !== null && (
                            <div className={styles.ticks} aria-hidden="true">
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
                                        style={{ left: `${percent(tick)}%` }}
                                    >
                                        {formatTick(tick, currency)}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    {rises.map((note) => (
                        <p key={note} className={styles.note}>
                            {note}
                        </p>
                    ))}
                </WithSide>
                <CardFoot>
                    <SourceLine />
                </CardFoot>
            </div>
        </section>
    );
};
