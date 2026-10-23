/**
 * Which points of a line a segment cannot draw. A missing value breaks the
 * line, so an observed value with no value beside it joins to nothing and
 * would not show at all. The chart gives those points a dot.
 */

/** True where a value is present and both neighbours are missing. The ends
 *  count the far side as missing, so a series of one value is a lone point. */
export const lonePoints = (values: readonly (number | null)[]): boolean[] =>
    values.map(
        (value, index) => value != null && values[index - 1] == null && values[index + 1] == null,
    );
