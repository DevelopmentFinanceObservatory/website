'use client';

import styles from './ClimateBars.module.scss';
import { Linked } from './Linked';
import { useWidth } from './useWidth';

import type { Context } from '../_data/types.ts';
import { CLIMATE_METHOD, CLIMATE_TITLE, LABELS } from '../_lib/copy.ts';
import { formatMoney, formatShare } from '../_lib/format.ts';
import { climateBars, type ClimateTotals } from '../_lib/groups.ts';
import type { Scope } from '../_lib/scope.ts';

const PARTS = [
    { key: 'adaptation', label: LABELS.adaptation, colour: '#2a9d8f', ink: '#1a1a16' },
    { key: 'mitigation', label: LABELS.mitigation, colour: '#6467de', ink: '#fff' },
    { key: 'crossCutting', label: LABELS.crossCutting, colour: '#c9a227', ink: '#2c2c26' },
] as const;

/** A rough width for a label in the bar's 12px type, to decide what fits in a segment. */
const textWidth = (text: string): number => text.length * 6.6 + 12;

/** Each part's start and share of the bar; all zero when the bar holds nothing. */
const partsOf = (totals: ClimateTotals) => {
    let start = 0;

    return PARTS.map((part) => {
        const share = totals.total > 0 ? totals[part.key] / totals.total : 0;
        const placed = { ...part, start, share };

        start += share;

        return placed;
    });
};

/**
 * Climate finance in 2024 as two 100% bars split by objective, the scope against all 62
 * or the two tiers, each segment labelled in the bar where the label fits.
 */
export const ClimateBars = ({ contexts, scope }: { contexts: Context[]; scope: Scope }) => {
    const [ref, width] = useWidth();
    const bars = climateBars(contexts, scope);

    return (
        <div ref={ref} className={styles.bars}>
            {bars.map((bar, index) => {
                const parts = partsOf(bar.totals);
                const read = parts
                    .map((part) => `${part.label.toLowerCase()} ${formatShare(part.share)}`)
                    .join(', ');
                const empty = bar.totals.total <= 0;

                return (
                    // Two bars in fixed places: the scope's first, the comparison second.
                    <div key={index} className={styles.row}>
                        <p className={styles.head}>
                            <span key={bar.label} className={styles.name}>
                                {bar.label}
                            </span>
                            <span key={bar.totals.total} className={styles.total}>
                                {empty ? '' : formatMoney(bar.totals.total)}
                            </span>
                        </p>
                        <div
                            className={styles.bar}
                            role="img"
                            aria-label={
                                empty
                                    ? `${CLIMATE_TITLE}. ${bar.label}: ${LABELS.noData.toLowerCase()}.`
                                    : `${CLIMATE_TITLE}. ${bar.label}, ${formatMoney(bar.totals.total)}: ${read}.`
                            }
                        >
                            {parts.map((part) => (
                                <span
                                    key={part.key}
                                    className={styles.part}
                                    style={{
                                        background: part.colour,
                                        transform: `translateX(${part.start * 100}%) scaleX(${part.share})`,
                                    }}
                                />
                            ))}
                            {parts.map((part) => {
                                const room = part.share * width;
                                const share = formatShare(part.share);
                                const long = `${part.label} ${share}`;
                                const text =
                                    room >= textWidth(long)
                                        ? long
                                        : room >= textWidth(share)
                                          ? share
                                          : '';

                                return (
                                    <span
                                        key={`${part.key}-label`}
                                        className={styles.partLabel}
                                        data-rule={part.start > 0 && part.share > 0}
                                        aria-hidden="true"
                                        style={{
                                            color: part.ink,
                                            transform: `translateX(${part.start * 100}%)`,
                                        }}
                                    >
                                        <span key={text} className={styles.fade}>
                                            {text}
                                        </span>
                                    </span>
                                );
                            })}
                            <span
                                key={empty ? 'empty' : 'held'}
                                className={styles.empty}
                                aria-hidden="true"
                            >
                                {empty ? LABELS.noData : ''}
                            </span>
                        </div>
                    </div>
                );
            })}
            <p className={styles.method}>
                <Linked words={CLIMATE_METHOD} />
            </p>
        </div>
    );
};
