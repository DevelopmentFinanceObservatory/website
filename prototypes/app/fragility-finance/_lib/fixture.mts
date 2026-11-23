// Fixtures shared by the _lib tests.
import type { Context, DebtYear, FlowYear } from '../_data/types.ts';

import { LAST_PAID_YEAR, yearsFrom } from './profile.ts';

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

/** One `flow` a year from 2015 to 2024, its values `values` gives for the year. */
export const decade = (
    values: (year: number) => Partial<Omit<FlowYear, 'year'>> = () => ({}),
): FlowYear[] => yearsFrom(2015, 2024).map((year) => flow(year, values(year)));

/** Debt service of `value` a year from `first` to `last`, scheduled after LAST_PAID_YEAR. */
export const debtYears = (first: number, last: number, value: number): DebtYear[] =>
    yearsFrom(first, last).map((year) => ({ year, value, projected: year > LAST_PAID_YEAR }));

const reading = (value: number) => ({ year: 2024, value });

/**
 * Five contexts, two in extreme fragility and three in high, each holding ten years of ODA,
 * OOF and FDI. Sudan is in arrears. South Sudan is outside IDS and holds remittances in 2024
 * alone. Equatorial Guinea enters IDS in 2018 and holds no remittances. In 2024 Sudan and
 * Equatorial Guinea pay more in debt service than they receive in ODA.
 */
export const SAMPLE: Context[] = [
    context({
        iso3: 'MOZ',
        name: 'Mozambique',
        tier: 'extreme',
        rank: 2,
        flows: decade(() => ({
            oda: 3e9,
            oof: 23e6,
            remittances: 267e6,
            fdi: 3.6e9,
            debtService: 917e6,
        })),
        debtService: debtYears(2015, 2033, 917e6),
        population: { '2024': 34e6 },
        indicators: { stunting: reading(37), water: reading(63), dtp3: reading(80) },
    }),
    context({
        iso3: 'SDN',
        name: 'Sudan',
        tier: 'extreme',
        rank: 1,
        flows: decade(() => ({
            oda: 2e9,
            oof: 0,
            remittances: 1e9,
            fdi: 500e6,
            debtService: 3e9,
        })),
        debtService: debtYears(2015, 2033, 3e9),
        population: { '2024': 50e6 },
        indicators: { stunting: reading(33), water: reading(60), dtp3: reading(70) },
    }),
    context({
        iso3: 'SSD',
        name: 'South Sudan',
        tier: 'high',
        rank: 3,
        flows: decade((year) => ({
            oda: 1.5e9,
            oof: 10e6,
            remittances: year === 2024 ? 20e6 : null,
            fdi: 100e6,
            debtService: null,
        })),
        debtService: [],
        population: { '2024': 11e6 },
        indicators: { stunting: null, water: reading(41), dtp3: null },
    }),
    context({
        iso3: 'GNQ',
        name: 'Equatorial Guinea',
        tier: 'high',
        rank: 4,
        flows: decade((year) => ({
            oda: 20e6,
            oof: 0,
            remittances: null,
            fdi: 200e6,
            debtService: year >= 2018 ? 400e6 : null,
        })),
        debtService: debtYears(2018, 2033, 400e6),
        population: { '2024': 1.9e6 },
        indicators: { stunting: reading(20), water: reading(66), dtp3: reading(53) },
    }),
    context({
        iso3: 'HTI',
        name: 'Haiti',
        tier: 'high',
        rank: 5,
        flows: decade(() => ({
            oda: 1e9,
            oof: 5e6,
            remittances: 4e9,
            fdi: 30e6,
            debtService: 600e6,
        })),
        debtService: debtYears(2015, 2033, 600e6),
        population: { '2024': 11.8e6 },
        indicators: { stunting: reading(22), water: reading(67), dtp3: reading(52) },
    }),
];

/**
 * 62 contexts, 20 in extreme fragility, whose 2024 figures repeat in short cycles, so many
 * fall on the same strip position, and some of which hold no remittances, debt service or
 * indicator.
 */
export const MANY: Context[] = Array.from({ length: 62 }, (_, index) => {
    const cycle = (step: number, size: number) => (index * step) % size;
    const indicator = (step: number) => (index % 10 === 0 ? null : reading(10 + cycle(step, 60)));

    return context({
        iso3: `C${String(index).padStart(2, '0')}`,
        name: `Context ${index}`,
        tier: index < 20 ? 'extreme' : 'high',
        rank: index + 1,
        pillars: [{ year: 2024, development: 1e8, humanitarian: 1e7 * cycle(17, 31), peace: 1e6 }],
        flows: [
            flow(2024, {
                oda: 1e8 * (1 + cycle(7, 13)),
                oof: 1e6 * cycle(3, 5),
                remittances: index % 9 === 0 ? null : 1e7 * cycle(11, 17),
                fdi: 1e7 * (cycle(5, 11) - 3),
                debtService: index % 8 === 0 ? null : 1e6 * (1 + cycle(13, 97)),
            }),
        ],
        indicators: { stunting: indicator(7), water: indicator(11), dtp3: indicator(13) },
    });
});
