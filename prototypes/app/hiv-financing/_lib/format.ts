// Number formatting shared by the sentences, the keys, the strip, the axes and the table.

/**
 * Compact US dollars: "$10.4bn", "$6.38bn", "$366m", "$4.5m", "$400k", "$0". Each threshold
 * sits where rounding would carry a figure into the next unit, so $999.7m reads "$1.00bn".
 */
export const money = (dollars: number): string => {
    if (dollars >= 9.995e9) {
        return `$${(dollars / 1e9).toFixed(1)}bn`;
    }

    if (dollars >= 999.5e6) {
        return `$${(dollars / 1e9).toFixed(2)}bn`;
    }

    if (dollars >= 9.95e6) {
        return `$${Math.round(dollars / 1e6)}m`;
    }

    if (dollars >= 999.5e3) {
        return `$${(dollars / 1e6).toFixed(1)}m`;
    }

    const thousands = Math.round(dollars / 1e3);

    return thousands === 0 ? '$0' : `$${thousands}k`;
};

/** A money axis tick, with no trailing zeros: "0", "$250k", "$2.5m", "$500m", "$8bn". */
export const axisMoney = (dollars: number): string => {
    if (dollars === 0) {
        return '0';
    }

    if (dollars >= 1e9) {
        return `$${Number((dollars / 1e9).toFixed(2))}bn`;
    }

    if (dollars >= 1e6) {
        return `$${Number((dollars / 1e6).toFixed(1))}m`;
    }

    return `$${Math.round(dollars / 1e3)}k`;
};

/** A head count in running text: "1.40 million", "450,000", "800". */
export const people = (n: number): string => {
    if (n >= 999_500) {
        return `${(n / 1e6).toFixed(2)} million`;
    }

    return (n >= 1000 ? Math.round(n / 1e3) * 1e3 : Math.round(n)).toLocaleString('en-GB');
};

/** A head count in a table cell: "1.40m", "450k", "800". */
export const peopleShort = (n: number): string => {
    if (n >= 999_500) {
        return `${(n / 1e6).toFixed(2)}m`;
    }

    return n >= 1000 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`;
};

/** A fraction as a whole percentage: 0.6349 -> "63%". */
export const pct = (share: number): string => `${Math.round(share * 100)}%`;

/** A value already in percent, to the whole point: 87.4 -> "87%". */
export const percent = (value: number): string => `${Math.round(value)}%`;

/** Aid per person, to the whole dollar: "$134". */
export const perPerson = (dollars: number): string => `$${Math.round(dollars)}`;

/** A death estimate rounded as the page prints it: to the nearest hundred from 1,000 up. */
export const roundDeaths = (n: number): number =>
    n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n);

/** A death estimate as the page prints it: "20,800", "640". */
export const deathCount = (n: number): string => roundDeaths(n).toLocaleString('en-GB');

/** "a", "a and b", "a, b, and c", with the Oxford comma. */
export const listOf = (items: readonly string[]): string => {
    if (items.length <= 2) {
        return items.join(' and ');
    }

    return `${items.slice(0, -1).join(', ')}, and ${items.at(-1) ?? ''}`;
};
