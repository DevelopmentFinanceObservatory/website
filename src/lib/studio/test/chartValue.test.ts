/**
 * `chartValue.ts` through a real Chart.js chart: the unit survives Chart.js's
 * option resolver, the tooltip writes the hovered point in it, off the value
 * axis of an upright or a transposed chart, and the value axis titles it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { BasePlatform, Chart, registerables, type LinearScale } from 'chart.js';

import { tooltipValue, valueAxisTitle, valueUnitOption } from '../chartValue.ts';

Chart.register(...registerables);

// Node has no canvas: a 2D context whose every method does nothing lets the
// chart build, lay out and resolve its options.
class StubPlatform extends BasePlatform {
    override acquireContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
        const context: Record<string | symbol, unknown> = { canvas };

        return new Proxy(context, {
            get: (target, key) =>
                key in target
                    ? target[key]
                    : key === 'measureText'
                      ? () => ({ width: 10 })
                      : () => undefined,
        }) as unknown as CanvasRenderingContext2D;
    }
}

const canvas = (): HTMLCanvasElement =>
    ({
        width: 300,
        height: 150,
        style: {},
        getAttribute: () => null,
    }) as unknown as HTMLCanvasElement;

// The hovered point's tooltip value on a one-bar chart of 5.333.
const hovered = (unit: string | undefined, horizontal: boolean) => {
    const chart = new Chart(canvas(), {
        platform: StubPlatform,
        type: 'bar',
        data: { labels: ['2024'], datasets: [{ label: 'Share', data: [5.333] }] },
        options: {
            animation: false,
            responsive: false,
            indexAxis: horizontal ? 'y' : 'x',
            ...valueUnitOption(unit),
            scales: { [horizontal ? 'x' : 'y']: { title: valueAxisTitle(unit) } },
        },
    });

    chart.tooltip!.setActiveElements([{ datasetIndex: 0, index: 0 }], { x: 0, y: 0 });

    const [point] = chart.tooltip!.dataPoints;
    const { title } = (chart.scales[horizontal ? 'x' : 'y'] as LinearScale).options;

    try {
        return {
            unit: (chart.options as { valueUnit?: string }).valueUnit,
            value: tooltipValue(chart, point!.parsed as { x?: number; y?: number }),
            axisTitle: title.display ? String(title.text) : null,
        };
    } finally {
        chart.destroy();
    }
};

test('the tooltip and the value axis write the hovered value in the chart unit', () => {
    const cases: [string | undefined, boolean, string, string | null][] = [
        ['Percent', false, '5.33%', null],
        ['Percent', true, '5.33%', null],
        ['USDollar', false, '5.33 US Dollar', 'US Dollar'],
        [
            'USD millions (constant 2023)',
            true,
            '5.33 USD millions (constant 2023)',
            'USD millions (constant 2023)',
        ],
        ['Person', false, '5.33 Person', 'Person'],
        [undefined, false, '5.33', null],
        [undefined, true, '5.33', null],
    ];

    for (const [unit, horizontal, value, axisTitle] of cases) {
        assert.deepEqual(
            hovered(unit, horizontal),
            { unit, value, axisTitle },
            `${unit} ${horizontal}`,
        );
    }
});
