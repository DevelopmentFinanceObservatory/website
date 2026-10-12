/**
 * Studio canvas theming. A theme is three tokens (the Customize panel's
 * Custom rows: accent, card surface, text) plus a series palette for the
 * charts — the canvas background itself stays fixed. The accent IS the
 * chart palette's root: a preset ships a hand-tuned palette whose first
 * series is its accent; overriding the accent regenerates the palette as
 * shades spun off the new colour. Presets ship
 * complete themes; Custom edits override single tokens on top of the active
 * preset. Applied as CSS custom properties on the canvas root — the cards'
 * SCSS reads them via the theme-scoped variables below — while Chart.js
 * (canvas 2D, blind to CSS) gets the resolved hex values through props.
 */

export type ThemeTokens = {
    accent: string;
    card: string;
    text: string;
};

export type SeriesPair = [dark: string, light: string];

export type ThemePreset = {
    id: string;
    label: string;
    tokens: ThemeTokens;
    series: SeriesPair[];
    // The five swatches shown on the preset tile.
    swatches: string[];
    // Hand-set derived colours (Default = the global palette verbatim);
    // presets without them get the mixed derivation.
    derived?: Partial<Pick<ThemeDerived, 'line' | 'muted' | 'caption' | 'popup' | 'glow'>>;
};

export type StudioTheme = {
    preset: string;
    overrides: Partial<ThemeTokens>;
};

// The canvas background is NOT themeable (--color-grid-bg-light) — only
// the cards, accents and charts recolour. Kept here for the glow derivation.
const CANVAS_BG = '#f7f7ee';

// The house series palette (Figma), [base, lighter] per series — drives the
// checkered weave.
const DEFAULT_SERIES: SeriesPair[] = [
    ['#6467de', '#8285e7'],
    ['#f6935a', '#f9b170'],
    ['#f46f58', '#f78f76'],
    ['#bb6fdc', '#cf94e8'],
    ['#662d6e', '#7f4487'],
    ['#463138', '#5e474f'],
    // Seventh and eighth (QA-84): the hues the six leave open — teal and
    // gold — so eight lines never share a colour.
    ['#2a9d8f', '#35c5b4'],
    ['#c9a227', '#dbb848'],
];

export const THEME_PRESETS: ThemePreset[] = [
    {
        id: 'default',
        label: 'Default',
        tokens: { accent: '#6467de', card: '#ffffff', text: '#484842' },
        series: DEFAULT_SERIES,
        swatches: ['#d2d2c5', '#e8e8d5', '#c6cebc', '#484842', '#f7f7ee'],
        // The house palette, exactly: net-light lines, stone muted text,
        // gray-1500 card captions, popup face, and the original glow shades.
        derived: {
            line: '#ececdb',
            muted: '#5e5e52',
            caption: '#abb4b7',
            popup: '#e8e8d5',
            glow: ['#dedcc6', '#cfceb6', '#c6c5ad'],
        },
    },
    {
        id: 'mono',
        label: 'Mono',
        tokens: { accent: '#1c1b1a', card: '#ffffff', text: '#1c1b1a' },
        series: [
            ['#1c1b1a', '#3a3937'],
            ['#8a8a8a', '#a3a3a3'],
            ['#c4c4c4', '#d6d6d6'],
            ['#5c5c5c', '#757575'],
            ['#a9a9a9', '#bdbdbd'],
            ['#404040', '#585858'],
            // A monochrome theme has only lightness to space eight series
            // out with: these two fill its widest gaps.
            ['#737373', '#8d8d8d'],
            ['#e0e0e0', '#ebebeb'],
        ],
        swatches: ['#a3a3a3', '#d9d9d9', '#6b6b6b', '#1c1b1a', '#f4f4f4'],
    },
    {
        id: 'dark',
        label: 'Dark',
        tokens: { accent: '#e6d3a3', card: '#2a2a30', text: '#f1efe4' },
        series: [
            ['#e6d3a3', '#efe1bf'],
            ['#d8d5c8', '#e5e3da'],
            ['#9fa8b8', '#b8bfcc'],
            ['#c98a6b', '#d9a68d'],
            ['#7fa78a', '#9dbfa6'],
            ['#b58fc9', '#c9adda'],
            ['#d99f9f', '#e7c4c4'],
            ['#a8b86b', '#bcc98d'],
        ],
        swatches: ['#2a2a30', '#1e1e22', '#d8d5c8', '#e6d3a3', '#111114'],
    },
    {
        id: 'tech',
        label: 'Tech',
        tokens: { accent: '#1d2a36', card: '#ffffff', text: '#1d2a36' },
        series: [
            ['#1d2a36', '#34465a'],
            ['#4fc3f7', '#7ad3f9'],
            ['#7fb2c9', '#a2c8d9'],
            ['#2f6f9f', '#4d8bb8'],
            ['#b3d9ea', '#c9e5f1'],
            ['#59616a', '#767e88'],
            ['#3fb8a0', '#61c9b4'],
            ['#d99a3f', '#e1b06a'],
        ],
        swatches: ['#1d2a36', '#b3d9ea', '#1a3550', '#4fc3f7', '#eaf3f8'],
    },
    {
        id: 'forest',
        label: 'Forest',
        tokens: { accent: '#2c5f2d', card: '#ffffff', text: '#1f3a1f' },
        series: [
            ['#2c5f2d', '#437a44'],
            ['#97bc62', '#adcc80'],
            ['#1f3a1f', '#355235'],
            ['#c8d9b0', '#d8e5c6'],
            ['#6b8e4e', '#86a76a'],
            ['#4a7c59', '#659374'],
            ['#a8683f', '#c18259'],
            ['#c9a227', '#dbb848'],
        ],
        swatches: ['#2c5f2d', '#c8d9b0', '#4a7c59', '#1f3a1f', '#eef3e8'],
    },
    {
        id: 'cobalt',
        label: 'Cobalt',
        tokens: { accent: '#2b4fd8', card: '#ffffff', text: '#14224a' },
        series: [
            ['#2b4fd8', '#4d6ee0'],
            ['#9fb4f4', '#b8c8f7'],
            ['#4d7cf6', '#7397f8'],
            ['#14224a', '#2b3a63'],
            ['#7c8fd8', '#98a8e2'],
            ['#c8d3f6', '#d8e0f8'],
            ['#d9a23f', '#e1b76a'],
            ['#2f9e8f', '#3bc5b2'],
        ],
        swatches: ['#2b4fd8', '#c8d3f6', '#4d7cf6', '#14224a', '#eceff8'],
    },
];

export const DEFAULT_THEME: StudioTheme = { preset: 'default', overrides: {} };

export const presetOf = (theme: StudioTheme): ThemePreset =>
    THEME_PRESETS.find((preset) => preset.id === theme.preset) ?? THEME_PRESETS[0]!;

export const resolveTokens = (theme: StudioTheme): ThemeTokens => ({
    ...presetOf(theme).tokens,
    ...theme.overrides,
});

// --- Colour helpers ----------------------------------------------------------

const hexToRgb = (hex: string): [number, number, number] => {
    const clean = hex.replace('#', '');
    const full =
        clean.length === 3
            ? clean
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : clean;
    const num = parseInt(full, 16);

    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
};

const rgbToHex = (r: number, g: number, b: number): string =>
    `#${[r, g, b]
        .map((v) =>
            Math.round(Math.max(0, Math.min(255, v)))
                .toString(16)
                .padStart(2, '0'),
        )
        .join('')}`;

// Mix `hex` toward `toward` by `amount` (0..1).
export const mix = (hex: string, toward: string, amount: number): string => {
    const [r1, g1, b1] = hexToRgb(hex);
    const [r2, g2, b2] = hexToRgb(toward);

    return rgbToHex(r1 + (r2 - r1) * amount, g1 + (g2 - g1) * amount, b1 + (b2 - b1) * amount);
};

const hexToHsl = (hex: string): [number, number, number] => {
    const [r0, g0, b0] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
    const max = Math.max(r0, g0, b0);
    const min = Math.min(r0, g0, b0);
    const l = (max + min) / 2;

    if (max === min) {
        return [0, 0, l];
    }

    const d = max - min;
    const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;

    if (max === r0) {
        h = (g0 - b0) / d + (g0 < b0 ? 6 : 0);
    } else if (max === g0) {
        h = (b0 - r0) / d + 2;
    } else {
        h = (r0 - g0) / d + 4;
    }

    return [h * 60, sat, l];
};

const hslToHex = (h: number, sat: number, l: number): string => {
    const hue = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * sat;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] =
        hue < 60
            ? [c, x, 0]
            : hue < 120
              ? [x, c, 0]
              : hue < 180
                ? [0, c, x]
                : hue < 240
                  ? [0, x, c]
                  : hue < 300
                    ? [x, 0, c]
                    : [c, 0, x];

    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
};

// An eight-series palette spun off one accent: the accent itself first,
// then shades stepping around the hue wheel and through lightness so
// neighbours stay distinguishable. Eight, because that is the most lines a
// chart draws and none of them may share a colour (QA-84). Each series'
// lighter partner is the weave's second square.
export const paletteFromAccent = (accent: string): SeriesPair[] => {
    const [h, sat, l] = hexToHsl(accent);
    // The derived seven carry their own floors. The accent's own shade is
    // whatever the user picked — black, grey, anything — and stepping the
    // hue of a colour with no saturation, or lightening one that is nearly
    // black, used to give seven shades of the same thing (QA-84).
    const spread = Math.min(0.9, Math.max(0.42, sat));
    // Away from the ends, where lightness has nowhere left to move.
    const anchor = Math.min(0.62, Math.max(0.36, l));
    // Hue all the way round in even steps, lightness riding a short cycle
    // on top, so neighbours differ in both.
    const lift = [0, 0.12, -0.08, 0.06, -0.12, 0.1, -0.04];

    return [
        [accent, hslToHex(h, sat, Math.min(0.92, l + 0.1))],
        ...lift.map((dl, index): SeriesPair => {
            const hue = h + (index + 1) * 45;
            const light = Math.min(0.78, Math.max(0.3, anchor + dl));

            return [
                hslToHex(hue, spread, light),
                hslToHex(hue, spread, Math.min(0.92, light + 0.1)),
            ];
        }),
    ];
};

export const isDark = (hex: string): boolean => {
    const [r, g, b] = hexToRgb(hex);

    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
};

// The full set of derived colours a theme needs, from the four tokens.
export type ThemeDerived = ThemeTokens & {
    // Card border / grid lines / hairlines: text tinted into the surface.
    line: string;
    // Muted text (axis, secondary labels).
    muted: string;
    // Card captions — the source tag and "Built with": a step quieter than
    // muted, so they recede under the data.
    caption: string;
    // Popup / menu face: card nudged toward text.
    popup: string;
    // Shockwave shades: the canvas nudged toward text, three steps.
    glow: [string, string, string];
    // Text on top of the accent (yellow pill, beacons).
    onAccent: string;
    // Series pairs.
    series: SeriesPair[];
};

export const deriveTheme = (theme: StudioTheme): ThemeDerived => {
    const preset = presetOf(theme);
    const tokens = resolveTokens(theme);
    const dark = isDark(tokens.card);
    // A preset's hand-set derived colours hold as long as its surface
    // tokens do; overriding card/text falls back to the mixed derivation.
    const surfaceIntact = !theme.overrides.card && !theme.overrides.text;
    const hand = surfaceIntact ? (preset.derived ?? {}) : {};

    return {
        ...tokens,
        line: hand.line ?? mix(tokens.card, tokens.text, dark ? 0.16 : 0.09),
        muted: hand.muted ?? mix(tokens.text, tokens.card, 0.45),
        caption: hand.caption ?? mix(tokens.text, tokens.card, 0.6),
        popup: hand.popup ?? mix(tokens.card, tokens.text, dark ? 0.12 : 0.1),
        glow: hand.glow ?? [
            mix(CANVAS_BG, tokens.text, 0.1),
            mix(CANVAS_BG, tokens.text, 0.16),
            mix(CANVAS_BG, tokens.text, 0.22),
        ],
        onAccent: isDark(tokens.accent) ? '#ffffff' : '#484842',
        // A custom accent regenerates the palette; otherwise the preset's
        // hand-tuned one stands.
        series: theme.overrides.accent
            ? paletteFromAccent(theme.overrides.accent)
            : presetOf(theme).series,
    };
};

// CSS custom properties consumed by the canvas SCSS (scoped, so the rest of
// the page keeps the global palette).
export const themeVars = (derived: ThemeDerived): Record<string, string> => ({
    '--th-accent': derived.accent,
    '--th-card': derived.card,
    '--th-text': derived.text,
    '--th-line': derived.line,
    '--th-muted': derived.muted,
    '--th-caption': derived.caption,
    '--th-popup': derived.popup,
    '--th-on-accent': derived.onAccent,
    // First series pair — the table header strip.
    '--th-series-dark': derived.series[0]![0],
    '--th-series-light': derived.series[0]![1],
});
