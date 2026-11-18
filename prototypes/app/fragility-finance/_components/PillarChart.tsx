import type { KeyRow } from './ChartKey';
import { keyReading } from './keyValue';
import { StackedBars } from './StackedBars';

import type { Context } from '../_data/types.ts';
import { pillarLayers, PILLAR_COLOURS } from '../_lib/chart.ts';
import { coverageText, LABELS, noOdaLine, scopeName } from '../_lib/copy.ts';
import { formatMoney } from '../_lib/format.ts';
import { PILLAR_KEYS, scopePillars } from '../_lib/groups.ts';
import { scopeContexts, type Scope } from '../_lib/scope.ts';

/** Gross ODA by pillar, stacked, by year, for a scope. */
export const PillarChart = ({ contexts, scope }: { contexts: Context[]; scope: Scope }) => {
    const pillars = scopePillars(contexts, scope);
    const layers = pillarLayers(pillars);
    const { years } = pillars;
    const total = scopeContexts(contexts, scope).length;
    const name = scopeName(contexts, scope);

    const keyRows = (index: number): KeyRow[] => {
        const year = years[index] ?? years.at(-1) ?? 0;
        const count = pillars.counts[index] ?? 0;
        const note =
            scope.kind === 'group' && count < total ? { note: coverageText(count, total) } : {};

        return PILLAR_KEYS.map((key) => ({
            key,
            colour: PILLAR_COLOURS[key],
            ...keyReading(LABELS[key], years, pillars.values[key], year, formatMoney),
            ...note,
        }));
    };

    const lastYear = years.at(-1) ?? 0;
    const empty = pillars.values.development.every((value) => value === null);

    return (
        <StackedBars
            years={years}
            layers={layers}
            keyRows={keyRows}
            emptyLine={empty ? noOdaLine(name, lastYear) : null}
            summary={
                `Stacked bar chart of gross ODA to ${name} by pillar, ${years[0]} to ` +
                `${lastYear}, in US dollars: development, humanitarian, and peace.`
            }
        />
    );
};
