/**
 * How a chart writes its values. The chart's unit rides on the Chart.js
 * options as a plain string, since the HTML tooltip receives the chart alone.
 * A function would not survive the trip, because Chart.js calls any root
 * option whose name does not start with "on" with its context before
 * handing it back.
 */

import { formatAxis } from '../chat/widgets.ts';

/** The options entry that carries the chart's unit ("Percent", "USD"). */
export const valueUnitOption = (unit: string | undefined): { valueUnit: string | undefined } => ({
    valueUnit: unit,
});

/** A tooltip point's value as text in the chart's unit, read off the value
 *  axis: y, or x once the chart is transposed. */
export const tooltipValue = (
    chart: { options: unknown },
    parsed: { x?: number | null; y?: number | null },
): string => {
    const { indexAxis, valueUnit } = chart.options as { indexAxis?: string; valueUnit?: string };

    return formatAxis(parsed[indexAxis === 'y' ? 'x' : 'y'] ?? 0, valueUnit);
};
