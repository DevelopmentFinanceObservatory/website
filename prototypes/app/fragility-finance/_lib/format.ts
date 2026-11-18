// Number and text formatting shared by the headline, the keys, the strips and the axes.

const MINUS = '−';

/** Compact US dollars: "$106bn", "$3.0bn", "$640m", "$4.5m", "$450k", "−$120m". */
export const formatMoney = (value: number): string => {
    const sign = value < 0 ? MINUS : '';
    const size = Math.abs(value);
    let text: string;

    if (size >= 9.95e9) {
        text = `${Math.round(size / 1e9)}bn`;
    } else if (size >= 1e9) {
        text = `${(size / 1e9).toFixed(1)}bn`;
    } else if (size >= 1e7) {
        text = `${Math.round(size / 1e6)}m`;
    } else if (size >= 1e6) {
        text = `${(size / 1e6).toFixed(1)}m`;
    } else if (size >= 1e3) {
        text = `${Math.round(size / 1e3)}k`;
    } else {
        text = `${Math.round(size)}`;
    }

    return text === '0' ? '$0' : `${sign}$${text}`;
};

/** A head count: "2.05bn", "560m", "1.2m", "450,000". */
export const formatPeople = (value: number): string => {
    if (value >= 1e9) {
        return `${(value / 1e9).toFixed(2)}bn`;
    }

    if (value >= 1e7) {
        return `${Math.round(value / 1e6)}m`;
    }

    if (value >= 1e6) {
        return `${(value / 1e6).toFixed(1)}m`;
    }

    return Math.round(value).toLocaleString('en-GB');
};

/** A money axis tick: "0", "$500m", "$2bn", "$2.5bn". */
export const formatTick = (value: number): string =>
    value === 0 ? '0' : formatMoney(value).replace(/\.0(?=bn|m$)/, '');

/** A fraction as a whole percentage: "44%". */
export const formatShare = (fraction: number): string => `${Math.round(fraction * 100)}%`;

/** A value already in percent, to the whole point: "37%". */
export const formatPercent = (percent: number): string => `${Math.round(percent)}%`;

/** A change as a signed whole percentage: "−56%", "+3%", "0%". */
export const formatChange = (change: number): string => {
    const percent = Math.round(change * 100);

    if (percent === 0) {
        return '0%';
    }

    return `${percent < 0 ? MINUS : '+'}${Math.abs(percent)}%`;
};

/** Dollars paid per dollar received: "1 cent", "30 cents", "$1.40", "$30". */
export const formatPerDollar = (ratio: number): string => {
    if (ratio < 0.995) {
        const cents = Math.round(ratio * 100);

        return cents === 1 ? '1 cent' : `${cents} cents`;
    }

    return ratio < 9.995 ? `$${ratio.toFixed(2)}` : `$${Math.round(ratio)}`;
};

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st. */
export const ordinal = (n: number): string => {
    const tens = n % 100;

    if (tens >= 11 && tens <= 13) {
        return `${n}th`;
    }

    return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
};

/** "a", "a and b", "a, b, and c", with the Oxford comma. */
export const listOf = (items: readonly string[]): string => {
    if (items.length <= 2) {
        return items.join(' and ');
    }

    return `${items.slice(0, -1).join(', ')}, and ${items.at(-1) ?? ''}`;
};
