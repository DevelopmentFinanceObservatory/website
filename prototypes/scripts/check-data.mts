// `pnpm check:data`: every app/<slug>/_data/*.json is a DataFile envelope
// (lib/dataFile.mts) with `provenance.sdk` naming a DFO SDK release,
// `provenance.query` and `provenance.retrieved` as an ISO 8601 UTC time, and
// `data`. `refs.json` and `live-refs.json` also map each read key to its ref
// (check-data-rules.mts). A page prints its source line from these fields, and CI cannot
// refetch them, so a file without them fails here.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { problems } from './check-data-rules.mts';

const APP_DIR = path.join(import.meta.dirname, '..', 'app');
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
        failures.push(
            `${where}: not valid JSON (${error instanceof Error ? error.message : String(error)})`,
        );
        continue;
    }

    for (const problem of problems(parsed, path.basename(file))) {
        failures.push(`${where}: ${problem}`);
    }
}

if (failures.length > 0) {
    console.error(failures.map((failure) => `check:data: ${failure}`).join('\n'));
    process.exit(1);
}

console.log(`check:data: ${dataFiles.length} data file(s) under app/*/_data/ carry the envelope.`);
