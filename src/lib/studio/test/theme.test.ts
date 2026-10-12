/**
 * `theme.ts`: every palette carries eight distinct series colours, so a
 * chart at its eight-line limit never draws two series the same (QA-84).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { paletteFromAccent, THEME_PRESETS, deriveTheme } from '../theme.ts';

const CHART_LINES = 8;

// CIE76: the eye's distance between two colours, roughly. Under ~2 they are
// the same colour; the hand-tuned palettes sit at 9 (Mono, which has only
// lightness to work with) to 20.
const lab = (hex: string): [number, number, number] => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
        .map((v) => v / 255)
        .map((v) => (v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92)) as [
        number,
        number,
        number,
    ];
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
    const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
    const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);

    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};

const closest = (colours: string[]): number => {
    let least = Infinity;

    for (let i = 0; i < colours.length; i += 1) {
        for (let j = i + 1; j < colours.length; j += 1) {
            const [a, b] = [lab(colours[i]!), lab(colours[j]!)];

            least = Math.min(least, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
        }
    }

    return least;
};

test('every preset has a colour for each of the eight lines', () => {
    for (const preset of THEME_PRESETS) {
        assert.ok(
            preset.series.length >= CHART_LINES,
            `${preset.id} has ${preset.series.length} series colours`,
        );

        const bases = preset.series.slice(0, CHART_LINES).map(([base]) => base);

        assert.equal(new Set(bases).size, CHART_LINES, `${preset.id} repeats a colour`);
        assert.ok(closest(bases) > 8, `${preset.id} has two colours ${closest(bases)} apart`);
    }
});

test('a palette spun off a custom accent has eight of its own', () => {
    for (const accent of ['#6467de', '#2c5f2d', '#888888', '#101010', '#f6f6e8']) {
        const palette = paletteFromAccent(accent);

        assert.ok(palette.length >= CHART_LINES, `${accent} gave ${palette.length}`);
        assert.equal(
            new Set(palette.slice(0, CHART_LINES).map(([base]) => base)).size,
            CHART_LINES,
            `${accent} repeats a colour`,
        );

        const bases = palette.slice(0, CHART_LINES).map(([base]) => base);

        // A dark or grey accent used to collapse into seven shades of
        // itself — the same bug the presets were fixed for (QA-84).
        assert.ok(closest(bases) > 12, `${accent} gave two colours ${closest(bases)} apart`);
    }
});

test('a custom accent on a preset still resolves to eight', () => {
    const derived = deriveTheme({ preset: 'forest', overrides: { accent: '#2b4fd8' } });

    assert.equal(
        new Set(derived.series.slice(0, CHART_LINES).map(([base]) => base)).size,
        CHART_LINES,
    );
});
