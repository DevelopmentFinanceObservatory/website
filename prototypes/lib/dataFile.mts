// The envelope every prototype data file uses: what the page shows, plus the
// SDK, the question and the time it was fetched, so the source line travels
// with the data and CI needs no DFO credentials. `pnpm check:data` enforces
// the shape, and a Python data step writes the same one.
//
// A page imports only the types (`import type`), so this module's node:fs
// never reaches the browser bundle. It is .mts because the package has no
// "type" field, and Node would warn when it loads a .ts file as ESM.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { VERSION } from '@developmentfinance/client';

export type Provenance = {
    /** `@developmentfinance/client@<version>` or `development-finance==<version>` */
    sdk: string;
    /** the question or call that produced the data */
    query: string;
    /** when the data was fetched, ISO 8601 in UTC */
    retrieved: string;
    /** optional extras, such as Search's sentence, the citation or a share URL */
    [field: string]: unknown;
};

export type DataFile<TData> = {
    provenance: Provenance;
    data: TData;
};

/** The SDK stamp, read from the installed client. */
export const SDK = `@developmentfinance/client@${VERSION}`;

/**
 * Writes `data` to `file` as a DataFile envelope, stamping the SDK version
 * and the retrieval time. Pass a URL built from `import.meta.url` so the
 * path does not depend on where the step runs from. Returns the envelope.
 */
export const writeDataFile = <TData,>(
    file: string | URL,
    { query, data, extra = {} }: { query: string; data: TData; extra?: Record<string, unknown> },
): DataFile<TData> => {
    const target = file instanceof URL ? fileURLToPath(file) : path.resolve(file);
    const stamp = { sdk: SDK, query, retrieved: new Date().toISOString() };
    // The stamp leads the object and wins over an extra of the same name.
    const envelope: DataFile<TData> = { provenance: { ...stamp, ...extra, ...stamp }, data };

    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(envelope, null, 2)}\n`);
    console.log(`Wrote ${path.relative(process.cwd(), target)}.`);

    return envelope;
};
