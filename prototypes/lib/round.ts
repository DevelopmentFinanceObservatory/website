// Rounding that matches the data steps' Python, so a page's figures equal the committed ones.

/**
 * Rounds as Python's `round(value, digits)` does: to the nearest, with an exact half going to
 * the even digit. An exact half at `digits` places is an odd multiple of 2^-(digits + 1), so
 * the test for one is exact in binary. Every other value rounds as `toFixed` does, from its
 * exact binary value.
 */
export const pythonRound = (value: number, digits = 0): number => {
    if (!Number.isFinite(value)) {
        throw new Error(`cannot round ${value}`);
    }

    const sign = value < 0 ? -1 : 1;
    const magnitude = Math.abs(value);
    const halves = magnitude * 2 ** (digits + 1);
    // toFixed takes the larger of two equally near numbers.
    const up = Number(magnitude.toFixed(digits));

    if (!Number.isInteger(halves) || halves % 2 === 0) {
        return sign * up;
    }

    const lastDigit = Math.round(up * 10 ** digits) % 10;

    return sign * (lastDigit % 2 === 0 ? up : Number((up - 10 ** -digits).toFixed(digits)));
};
