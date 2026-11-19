// The rules `pnpm check:data` applies to one parsed data file, apart from the
// file walk so a test can feed each rule a bad value.
const SDK = /^(?:@developmentfinance\/client@|development-finance==)\d+\.\d+\.\d+\S*$/;
const UTC_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** A DatasetRef as `to_json()` writes it, which always carries its format version. */
const isRef = (value: unknown): boolean =>
    isRecord(value) && Number.isInteger(value.format_version);

/**
 * What is wrong with the `data` of a refs file, empty when it is sound.
 * `refs.json` maps each read key to `{ ref, provenance }`, and `live-refs.json`
 * maps each key to a ref the browser fetches.
 */
const refProblems = (name: string, data: unknown): string[] => {
    if (!isRecord(data) || Object.keys(data).length === 0) {
        return ['"data" must map each read key to its ref'];
    }

    const found: string[] = [];

    for (const [key, entry] of Object.entries(data)) {
        if (name === 'live-refs.json') {
            if (!isRef(entry)) {
                found.push(`data.${key} must be a ref object (with format_version)`);
            }
            continue;
        }

        if (!isRecord(entry) || !isRef(entry.ref)) {
            found.push(`data.${key}.ref must be a ref object (with format_version)`);
        }

        if (!isRecord(entry) || !isRecord(entry.provenance)) {
            found.push(`data.${key}.provenance must be the dataset's provenance object`);
        }
    }

    return found;
};

/**
 * What is wrong with one parsed file, empty when it is a valid envelope.
 * `name` is the file's base name, which selects the extra rules for
 * `refs.json` and `live-refs.json`.
 */
export const problems = (value: unknown, name = ''): string[] => {
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
        found.push(
            'provenance.sdk must be "@developmentfinance/client@<version>" or "development-finance==<version>"',
        );
    }

    if (typeof provenance.query !== 'string' || provenance.query.trim() === '') {
        found.push('provenance.query must name the question or call made');
    }

    const { retrieved } = provenance;

    if (
        typeof retrieved !== 'string' ||
        !UTC_TIME.test(retrieved) ||
        Number.isNaN(Date.parse(retrieved))
    ) {
        found.push(
            'provenance.retrieved must be an ISO 8601 UTC time such as 2026-11-16T09:30:00.000Z',
        );
    }

    if (name === 'refs.json' || name === 'live-refs.json') {
        found.push(...refProblems(name, value.data));
    }

    return found;
};
