// `pnpm check:data`: every app/<slug>/_data/*.json is a DataFile envelope
// (lib/dataFile.mts) with `provenance.sdk` naming a DFO SDK release,
// `provenance.query` and `provenance.retrieved` as an ISO 8601 UTC time, and
// `data`. A page prints its source line from these fields, and CI cannot
// refetch them, so a file without them fails here.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const APP_DIR = path.join(import.meta.dirname, '..', 'app');
const SDK = /^(?:@developmentfinance\/client@|development-finance==)\d+\.\d+\.\d+\S*$/;
const UTC_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** What is wrong with one parsed file, empty when it is a valid envelope. */
const problems = (value: unknown): string[] => {
    if (!isRecord(value)) {
        return ['is not a JSON object'];
    }

    const found: string[] = [];
    const { provenance } = value;

    if (!('data' in value)) {
        found.push('has no "data"');
    }

    if (!isRecord(provenance)) {
        return [...found, 'has no "provenance" object'];
    }

    if (typeof provenance.sdk !== 'string' || !SDK.test(provenance.sdk)) {
        found.push('provenance.sdk must be "@developmentfinance/client@<version>" or "development-finance==<version>"');
    }

    if (typeof provenance.query !== 'string' || provenance.query.trim() === '') {
        found.push('provenance.query must name the question or call made');
    }

    const { retrieved } = provenance;

    if (typeof retrieved !== 'string' || !UTC_TIME.test(retrieved) || Number.isNaN(Date.parse(retrieved))) {
        found.push('provenance.retrieved must be an ISO 8601 UTC time such as 2026-11-16T09:30:00.000Z');
    }

    return found;
};

const dataFiles = existsSync(APP_DIR)
    ? readdirSync(APP_DIR, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => path.join(APP_DIR, entry.name, '_data'))
          .filter((dir) => existsSync(dir))
          .flatMap((dir) =>
              readdirSync(dir)
                  .filter((name) => name.endsWith('.json'))
                  .map((name) => path.join(dir, name)),
          )
    : [];

const failures: string[] = [];

for (const file of dataFiles) {
    const where = path.relative(path.dirname(APP_DIR), file);
    let parsed: unknown;

    try {
        parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
        failures.push(`${where}: not valid JSON (${error instanceof Error ? error.message : String(error)})`);
        continue;
    }

    for (const problem of problems(parsed)) {
        failures.push(`${where}: ${problem}`);
    }
}

if (failures.length > 0) {
    console.error(failures.map((failure) => `check:data: ${failure}`).join('\n'));
    process.exit(1);
}

console.log(`check:data: ${dataFiles.length} data file(s) under app/*/_data/ carry the envelope.`);
