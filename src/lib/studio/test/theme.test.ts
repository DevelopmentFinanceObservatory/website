/**
 * `theme.ts`: every palette carries ten distinct series colours, so a chart
 * of up to ten series never draws two the same, and the first eight stay the
 * colours saved charts were drawn in. Muted text and captions read at
 * 4.5:1 on every card face.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEFAULT_THEME,
    deriveTheme,
    paletteFromAccent,
    type StudioTheme,
    THEME_PRESETS,
} from '../theme.ts';

const CHART_LINES = 10;

// CIE76: the eye's distance between two colours, roughly. Under ~2 they are
// the same colour; the hand-tuned palettes sit at 8.6 (Mono, which has only
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

test('every preset has a colour for each of ten lines', () => {
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

test('a palette spun off a custom accent has ten of its own', () => {
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

test('a custom accent on a preset still resolves to ten', () => {
    const derived = deriveTheme({ preset: 'forest', overrides: { accent: '#2b4fd8' } });

    assert.equal(
        new Set(derived.series.slice(0, CHART_LINES).map(([base]) => base)).size,
        CHART_LINES,
    );
});

// The first eight series colours of each palette. A saved chart stores its
// theme, so these colours must hold.
const FIRST_EIGHT: Record<string, string[]> = {
    default: [
        '#6467de',
        '#f6935a',
        '#f46f58',
        '#bb6fdc',
        '#662d6e',
        '#463138',
        '#2a9d8f',
        '#c9a227',
    ],
    mono: ['#1c1b1a', '#8a8a8a', '#c4c4c4', '#5c5c5c', '#a9a9a9', '#404040', '#737373', '#e0e0e0'],
    dark: ['#e6d3a3', '#d8d5c8', '#9fa8b8', '#c98a6b', '#7fa78a', '#b58fc9', '#d99f9f', '#a8b86b'],
    tech: ['#1d2a36', '#4fc3f7', '#7fb2c9', '#2f6f9f', '#b3d9ea', '#59616a', '#3fb8a0', '#d99a3f'],
    forest: [
        '#2c5f2d',
        '#97bc62',
        '#1f3a1f',
        '#c8d9b0',
        '#6b8e4e',
        '#4a7c59',
        '#a8683f',
        '#c9a227',
    ],
    cobalt: [
        '#2b4fd8',
        '#9fb4f4',
        '#4d7cf6',
        '#14224a',
        '#7c8fd8',
        '#c8d3f6',
        '#d9a23f',
        '#2f9e8f',
    ],
};

test('every preset keeps the first eight colours saved charts were drawn in', () => {
    assert.deepEqual(
        THEME_PRESETS.map(({ id }) => id),
        Object.keys(FIRST_EIGHT),
    );

    for (const preset of THEME_PRESETS) {
        assert.deepEqual(
            preset.series.slice(0, 8).map(([base]) => base),
            FIRST_EIGHT[preset.id],
            preset.id,
        );
    }
});

test('a custom accent keeps its first eight colours, 45° apart', () => {
    assert.deepEqual(
        paletteFromAccent('#6467de')
            .slice(0, 8)
            .map(([base]) => base),
        ['#6467de', '#ba5fdd', '#e892bf', '#d6603e', '#e2e078', '#5ad22d', '#89e6b5', '#4ebad9'],
    );
    assert.deepEqual(
        paletteFromAccent('#101010')
            .slice(0, 8)
            .map(([base]) => base),
        ['#101010', '#826f35', '#7aae47', '#2c6d3c', '#3e9898', '#2c3c6d', '#7544a7', '#742f63'],
    );
});

// WCAG 2 contrast, computed here independently of theme.ts, so the floor has a second check.
const wcagLuminance = (hex: string): number => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [
        number,
        number,
        number,
    ];

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a: string, b: string): number => {
    const [la, lb] = [wcagLuminance(a), wcagLuminance(b)];

    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const FLOOR_CASES: [name: string, theme: StudioTheme, face?: string][] = [
    ...THEME_PRESETS.map(({ id }): [string, StudioTheme] => [id, { preset: id, overrides: {} }]),
    ['default on the showcase face', DEFAULT_THEME, '#f6f6e8'],
    ['light custom card', { preset: 'default', overrides: { card: '#f0e6d2', text: '#8a8a80' } }],
    ['dark custom card', { preset: 'dark', overrides: { card: '#1a1a2e', text: '#7a7a90' } }],
    ['mid-grey custom card', { preset: 'mono', overrides: { card: '#777777', text: '#888888' } }],
];

test('muted text and captions hold 4.5:1 on their card', () => {
    for (const [name, theme, face] of FLOOR_CASES) {
        const derived = deriveTheme(theme, face);

        if (face) assert.equal(derived.card, face, name);

        for (const role of ['muted', 'caption'] as const) {
            const got = ratio(derived[role], derived.card);

            assert.ok(got >= 4.5, `${name} ${role} ${derived[role]} is ${got.toFixed(2)}:1`);
        }
    }
});

test('the default caption darkens to the floor and keeps its cool grey', () => {
    // #abb4b7 scaled toward black, on white and on the showcase face.
    assert.equal(deriveTheme(DEFAULT_THEME).caption, '#727779');
    assert.equal(deriveTheme(DEFAULT_THEME, '#f6f6e8').caption, '#6c7173');
    // Muted already clears the floor and stays the house stone.
    assert.equal(deriveTheme(DEFAULT_THEME, '#f6f6e8').muted, '#5e5e52');
});
