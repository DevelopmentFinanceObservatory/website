/** Nice tick steps within one power of ten. */
const FACTORS = [1, 2, 2.5, 5];

/**
 * Ticks from zero to the first nice value at or above `max`, on the smallest step of 1, 2,
 * 2.5 or 5 times a power of ten that needs at most `intervals` intervals.
 */
export const ticksTo = (max: number, intervals = 5): number[] => {
    if (!(max > 0)) {
        return [0, 1];
    }

    let magnitude = 10 ** Math.floor(Math.log10(max / intervals));
    let step = magnitude;

    for (;;) {
        const found = FACTORS.map((factor) => factor * magnitude).find(
            (candidate) => Math.ceil(max / candidate - 1e-9) <= intervals,
        );

        if (found !== undefined) {
            step = found;
            break;
        }

        magnitude *= 10;
    }

    const count = Math.ceil(max / step - 1e-9);

    return Array.from({ length: count + 1 }, (_, i) => i * step);
};
