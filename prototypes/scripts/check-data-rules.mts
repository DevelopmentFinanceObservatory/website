// The rules `pnpm check:data` applies to one parsed data file, apart from the
// file walk so a test can feed each rule a bad value.
const SDK = /^(?:@developmentfinance\/client@|development-finance==)\d+\.\d+\.\d+\S*$/;
const UTC_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** One thing wrong with a data file: a stable `code` for tests and tooling, and a message for people. */
export type Problem = { code: string; message: string };

const problem = (code: string, message: string): Problem => ({ code, message });

/** A DatasetRef as `to_json()` writes it, which always carries its format version. */
const isRef = (value: unknown): value is Record<string, unknown> =>
    isRecord(value) && Number.isInteger(value.format_version);

const membersOf = (value: unknown): Record<string, unknown>[] =>
    isRecord(value) && Array.isArray(value.members) ? value.members.filter(isRecord) : [];

/**
 * The content versions a `refs.json` data map pins: the members its
 * provenance lists as pinned. A live ref may only name one of these.
 */
export const pinnedVersions = (refsData: unknown): Set<string> => {
    const versions = new Set<string>();

    for (const entry of isRecord(refsData) ? Object.values(refsData) : []) {
        const provenance = isRecord(entry) ? entry.provenance : undefined;

        for (const member of membersOf(provenance)) {
            if (member.pinned === true && typeof member.content_version === 'string') {
                versions.add(member.content_version);
            }
        }
    }

    return versions;
};

/** A ref names at least one member, as the browser needs to read it. */
const memberProblems = (where: string, ref: Record<string, unknown>): Problem[] =>
    membersOf(ref).length === 0
        ? [problem('ref_no_members', `${where} must list at least one member`)]
        : [];

/**
 * What is wrong with the `data` of a refs file, empty when it is sound.
 * `refs.json` maps each read key to `{ ref, provenance }`, and `live-refs.json`
 * maps each key to a ref the browser fetches. `pinned` holds the content
 * versions the directory's `refs.json` pins, which every live member must be in.
 */
const refProblems = (name: string, data: unknown, pinned: ReadonlySet<string>): Problem[] => {
    if (!isRecord(data) || Object.keys(data).length === 0) {
        return [problem('data_not_map', '"data" must map each read key to its ref')];
    }

    const found: Problem[] = [];

    for (const [key, entry] of Object.entries(data)) {
        if (name === 'live-refs.json') {
            if (!isRef(entry)) {
                found.push(
                    problem(
                        'ref_invalid',
                        `data.${key} must be a ref object (with format_version)`,
                    ),
                );
                continue;
            }

            found.push(...memberProblems(`data.${key}`, entry));

            for (const member of membersOf(entry)) {
                const version = member.content_version;

                if (typeof version !== 'string' || !pinned.has(version)) {
                    found.push(
                        problem(
                            'live_member_unpinned',
                            `data.${key} names content version ${String(version)}, which refs.json does not pin`,
                        ),
                    );
                }
            }
            continue;
        }

        const ref = isRecord(entry) ? entry.ref : undefined;
        const provenance = isRecord(entry) ? entry.provenance : undefined;

        if (isRef(ref)) {
            found.push(...memberProblems(`data.${key}.ref`, ref));
        } else {
            found.push(
                problem(
                    'ref_invalid',
                    `data.${key}.ref must be a ref object (with format_version)`,
                ),
            );
        }

        if (!isRecord(provenance)) {
            found.push(
                problem(
                    'provenance_invalid',
                    `data.${key}.provenance must be the dataset's provenance object`,
                ),
            );
            continue;
        }

        const members = membersOf(provenance);

        if (members.length === 0) {
            found.push(
                problem(
                    'provenance_no_members',
                    `data.${key}.provenance must list at least one member`,
                ),
            );
        }

        for (const member of members) {
            if (member.pinned !== true) {
                found.push(
                    problem(
                        'provenance_member_unpinned',
                        `data.${key}.provenance has a member that is not pinned (${String(member.content_version)})`,
                    ),
                );
            }
        }
    }

    return found;
};

/** The query config of a page that reads DFO at build time (`_lib/build.ts`): the reads its
 *  build makes. */
const REFS_FILES: ReadonlySet<string> = new Set(['refs.json', 'live-refs.json']);

/**
 * What is wrong with a data file named `name` under a page that reads DFO at build time, empty
 * when it is sound. The page's figures from DFO come from the build's reads, so the repository
 * holds only its refs files and data from outside DFO, which says so: its `provenance.outside`
 * names each source it comes from, as a list of non-empty strings.
 */
export const buildPageProblems = (name: string, value: unknown): Problem[] => {
    if (REFS_FILES.has(name)) {
        return [];
    }

    const provenance = isRecord(value) ? value.provenance : undefined;
    const outside = isRecord(provenance) ? provenance.outside : undefined;

    return Array.isArray(outside) &&
        outside.length > 0 &&
        outside.every((source) => typeof source === 'string' && source.trim() !== '')
        ? []
        : [
              problem(
                  'build_page_not_outside',
                  `the page reads DFO at build time (_lib/build.ts), so a data file other than ${[...REFS_FILES].join(' and ')} must hold data from outside DFO and name its sources in provenance.outside`,
              ),
          ];
};

/**
 * What is wrong with one parsed file, empty when it is a valid envelope.
 * `name` is the file's base name, which selects the extra rules for
 * `refs.json` and `live-refs.json`. `pinned` is `pinnedVersions` of the
 * same directory's `refs.json`, used for `live-refs.json`.
 */
export const problems = (
    value: unknown,
    name = '',
    pinned: ReadonlySet<string> = new Set(),
): Problem[] => {
    if (!isRecord(value)) {
        return [problem('not_object', 'is not a JSON object')];
    }

    const found: Problem[] = [];
    const { provenance } = value;

    if (!('data' in value)) {
        found.push(problem('no_data', 'has no "data"'));
    }

    if (!isRecord(provenance)) {
        return [...found, problem('no_provenance', 'has no "provenance" object')];
    }

    if (typeof provenance.sdk !== 'string' || !SDK.test(provenance.sdk)) {
        found.push(
            problem(
                'sdk_invalid',
                'provenance.sdk must be "@developmentfinance/client@<version>" or "development-finance==<version>"',
            ),
        );
    }

    if (typeof provenance.query !== 'string' || provenance.query.trim() === '') {
        found.push(
            problem('query_invalid', 'provenance.query must name the question or call made'),
        );
    }

    const { retrieved } = provenance;

    if (
        typeof retrieved !== 'string' ||
        !UTC_TIME.test(retrieved) ||
        Number.isNaN(Date.parse(retrieved))
    ) {
        found.push(
            problem(
                'retrieved_invalid',
                'provenance.retrieved must be an ISO 8601 UTC time such as 2026-11-16T09:30:00.000Z',
            ),
        );
    }

    if (name === 'refs.json' || name === 'live-refs.json') {
        found.push(...refProblems(name, value.data, pinned));
    }

    return found;
};
