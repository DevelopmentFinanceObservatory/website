import type { KeyRow } from './ChartKey';

import { readingAt } from '../_lib/chart.ts';
import { LABELS, readingLabel } from '../_lib/copy.ts';

/**
 * A key row's label, value and dimming for one series in `year`: the year's figure, the
 * series' last figure with its year once the series has ended, or "No data".
 */
export const keyReading = (
    label: string,
    years: readonly number[],
    values: readonly (number | null)[],
    year: number,
    format: (value: number) => string,
): Pick<KeyRow, 'label' | 'value' | 'dimmed'> => {
    const reading = readingAt(
        years.map((item, index) => ({ year: item, value: values[index] ?? null })),
        year,
    );

    if (reading.kind === 'held' || reading.kind === 'latest') {
        return {
            label: readingLabel(label, reading),
            value: format(reading.value),
            dimmed: reading.kind === 'latest',
        };
    }

    return { label, value: LABELS.noData, dimmed: true };
};
