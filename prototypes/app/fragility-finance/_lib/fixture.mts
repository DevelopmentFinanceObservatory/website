// Fixtures shared by the _lib tests.
import { readFileSync } from 'node:fs';

import type { Context, FlowYear } from '../_data/types.ts';

export const flow = (year: number, values: Partial<Omit<FlowYear, 'year'>> = {}): FlowYear => ({
    year,
    oda: 100,
    oof: 20,
    remittances: 50,
    fdi: 50,
    debtService: 30,
    ...values,
});

export const context = (overrides: Partial<Context> = {}): Context => ({
    iso3: 'AAA',
    name: 'Alpha',
    tier: 'extreme',
    score: -3,
    rank: 1,
    dimensions: {
        eco: { score: -1, category: 3 },
        env: { score: -2, category: 2 },
        hum: { score: -4, category: 1 },
        pol: { score: -1.5, category: 2 },
        sec: { score: -1.2, category: 3 },
        soc: { score: -2.5, category: 1 },
    },
    pillars: [{ year: 2024, development: 600, humanitarian: 300, peace: 100 }],
    flows: [flow(2023), flow(2024)],
    debtService: [
        { year: 2024, value: 30, projected: false },
        { year: 2026, value: 40, projected: true },
    ],
    donors: [{ name: 'IDA', value: 400, change2025: null }],
    climate: { year: 2024, adaptation: 60, mitigation: 30, both: 10 },
    population: { '2023': 10, '2024': 20 },
    indicators: { stunting: { year: 2024, value: 37 }, water: null, dtp3: null },
    ...overrides,
});

/** The 62 contexts in _data/profiles.json. */
export const PROFILES: Context[] = (
    JSON.parse(readFileSync(new URL('../_data/profiles.json', import.meta.url), 'utf8')) as {
        data: Context[];
    }
).data;
