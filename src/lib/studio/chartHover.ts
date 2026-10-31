/**
 * Which series a chart's hover names. The hover takes the whole category
 * slot under the pointer (so tiny bars stay reachable), and the tooltip
 * then names the series in it nearest the pointer.
 *
 * Lines in a slot share one position along the category axis, so they are
 * told apart by their values, and the line whose point sits closest to the
 * pointer's height wins. Grouped bars stand side by side along the category
 * axis, so the bar whose centre sits closest to the pointer across the slot
 * wins, whatever its height (a short bar under a tall neighbour stays
 * reachable).
 *
 * Holding Shift lists every series in the slot, largest first.
 */

/** A point of the hovered slot, in canvas pixels, with its value. */
export type SlotPoint = { x: number; y: number; value: number | null | undefined };

const hasValue = (value: number | null | undefined): value is number =>
    value != null && Number.isFinite(value);

/** The canvas axis that tells a slot's series apart, the category axis for
 *  bars and the value axis for lines. `indexAxis` is the chart's category
 *  axis, `y` once a bar chart is transposed. */
export const separatingAxis = (bars: boolean, indexAxis: 'x' | 'y'): 'x' | 'y' => {
    const valueAxis = indexAxis === 'x' ? 'y' : 'x';

    return bars ? indexAxis : valueAxis;
};

/** The position in `points` of the point nearest `pointer` along `axis`,
 *  skipping points without a value. The first wins a tie, so a single
 *  series always names itself. Null when no point has a value. */
export const nearestPoint = (
    points: readonly SlotPoint[],
    pointer: { x: number; y: number },
    axis: 'x' | 'y',
): number | null => {
    let best: number | null = null;
    let bestDistance = Infinity;

    points.forEach((point, index) => {
        if (!hasValue(point.value)) {
            return;
        }

        const distance = Math.abs(point[axis] - pointer[axis]);

        if (distance < bestDistance) {
            best = index;
            bestDistance = distance;
        }
    });

    return best;
};

/** The positions in `values` that hold a number, largest first; equal
 *  values keep their order. */
export const largestFirst = (values: readonly (number | null | undefined)[]): number[] =>
    values
        .flatMap((value, index) => (hasValue(value) ? [index] : []))
        .sort((a, b) => values[b]! - values[a]!);
