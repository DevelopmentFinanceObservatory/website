/**
 * Seeds as the public repository DevelopmentFinanceObservatory/pipelines
 * keeps them under `dbt/seeds/`: the header and up to the first 20 rows of
 * `weo_indicator_mapping`, `dac1_indicator_mapping`,
 * `dac2a_indicator_mapping` and `ids_measure_mapping`.
 */
import { readFileSync } from 'node:fs';

export type SeedName = 'weo' | 'dac1' | 'dac2a' | 'ids';

export const seedFixture = (name: SeedName): string =>
    readFileSync(new URL(`./fixtures/seeds/${name}.csv`, import.meta.url), 'utf8');
