import type { KeyRow } from './ChartKey';
import { keyReading } from './keyValue';
import { StackedBars } from './StackedBars';

import type { Context } from '../_data/types.ts';
import { FLOW_COLOURS, flowLayers } from '../_lib/chart.ts';
import { coverageText, LABELS, scopeName } from '../_lib/copy.ts';
import { formatMoney } from '../_lib/format.ts';
import { FLOW_KEYS, scopeFlows } from '../_lib/groups.ts';
import { scopeContexts, type Scope } from '../_lib/scope.ts';

/**
 * ODA, OOF, remittances and FDI stacked above the axis and debt service below, by year, for a
 * scope. A group's key says how many contexts each sum covers where that is fewer than all.
 */
export const MoneyChart = ({ contexts, scope }: { contexts: Context[]; scope: Scope }) => {
    const flows = scopeFlows(contexts, scope);
    const layers = flowLayers(flows);
    const { years } = flows.oda;
    const total = scopeContexts(contexts, scope).length;

    const keyRows = (index: number): KeyRow[] => {
        const year = years[index] ?? years.at(-1) ?? 0;

        return FLOW_KEYS.map((key) => {
            const series = flows[key];
            const count = series.counts[index] ?? 0;
            const value = series.values[index] ?? null;
            const colour =
                key === 'fdi' && value !== null && value < 0
                    ? FLOW_COLOURS.fdiOutflow
                    : FLOW_COLOURS[key];

            return {
                key,
                colour,
                ...keyReading(LABELS[key], years, series.values, year, formatMoney),
                ...(scope.kind === 'group' && count < total
                    ? { note: coverageText(count, total) }
                    : {}),
            };
        });
    };

    const empty = layers.every((layer) => layer.values.every((value) => value === null));

    return (
        <StackedBars
            years={years}
            layers={layers}
            keyRows={keyRows}
            emptyLine={empty ? LABELS.noData : null}
            summary={
                `Stacked bar chart of the money ${scopeName(contexts, scope)} received and ` +
                `paid out, ${years[0]} to ${years.at(-1)}, in US dollars: ODA, OOF, remittances, ` +
                'and FDI inflows above the axis, debt service and net FDI outflows below it.'
            }
        />
    );
};
