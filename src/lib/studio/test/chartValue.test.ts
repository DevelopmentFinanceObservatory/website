/**
 * `chartValue.ts` through a real Chart.js chart: the unit survives Chart.js's
 * option resolver, and the tooltip writes the hovered point in it, off the
 * value axis of an upright or a transposed chart.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { BasePlatform, Chart, registerables } from 'chart.js';

import { tooltipValue, valueUnitOption } from '../chartValue.ts';

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
        },
    });

    chart.tooltip!.setActiveElements([{ datasetIndex: 0, index: 0 }], { x: 0, y: 0 });

    const [point] = chart.tooltip!.dataPoints;

    try {
        return {
            unit: (chart.options as { valueUnit?: string }).valueUnit,
            value: tooltipValue(chart, point!.parsed as { x?: number; y?: number }),
        };
    } finally {
        chart.destroy();
    }
};

test('the tooltip writes the hovered value in the unit the chart options carry', () => {
    const cases: [string | undefined, boolean, string][] = [
        ['Percent', false, '5.33%'],
        ['Percent', true, '5.33%'],
        [undefined, false, '5.33'],
        [undefined, true, '5.33'],
    ];

    for (const [unit, horizontal, value] of cases) {
        assert.deepEqual(hovered(unit, horizontal), { unit, value }, `${unit} ${horizontal}`);
    }
});
