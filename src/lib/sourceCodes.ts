/**
 * A publisher's own series codes ("World Bank code DT.TDS.DEGG.CD"), as Get
 * Data's "About this answer" and Studio's More Info panel both name them.
 * Search serves them as `stat_vars.source_codes` and a card's description
 * as `about.source_codes` and on each drawn value, one shape in both: the
 * provenance issuing the code, the code, and `exact` when the code names
 * the whole of what lists it.
 */

export type SourceCode = { provenance: string; code: string; exact?: boolean | null };

/** Codes grouped by publisher. `exact` is true when each code names the
 *  whole of what lists it; otherwise that is built from them. Each
 *  publisher lists its first codes and counts the rest as `more`. */
export type SourceCodeGroups = {
    exact: boolean;
    publishers: { publisher: string; codes: string[]; more: number }[];
};

/** A run of the sentence naming the codes: words, or one code. */
export type SourceCodePart = { text: string } | { code: string };

// The codes each publisher lists before the rest are counted as "more".
const LISTED = 3;

// The name for a publisher the caller cannot name.
const UNNAMED = 'Source';

/** The codes to name, grouped by the publisher `publisherOf` names for each
 *  provenance: the exact codes when any is exact, else every code. Null
 *  when there are none. */
export const groupSourceCodes = (
    entries: readonly SourceCode[],
    publisherOf: (provenance: string) => string | null,
): SourceCodeGroups | null => {
    const exactCodes = entries.filter((entry) => entry.exact);
    const shown = exactCodes.length > 0 ? exactCodes : entries;
    const byPublisher = new Map<string, string[]>();

    for (const entry of shown) {
        const publisher = publisherOf(entry.provenance) || UNNAMED;

        byPublisher.set(publisher, [...(byPublisher.get(publisher) ?? []), entry.code]);
    }

    return shown.length === 0
        ? null
        : {
              exact: exactCodes.length > 0,
              publishers: [...byPublisher].map(([publisher, codes]) => ({
                  publisher,
                  codes: codes.slice(0, LISTED),
                  more: Math.max(codes.length - LISTED, 0),
              })),
          };
};

/** The sentence naming the codes, as parts: "World Bank code
 *  DT.TDS.DEGG.CD", or "Built from World Bank codes A, B and C" when no
 *  code names the whole. */
export const sourceCodeParts = ({ exact, publishers }: SourceCodeGroups): SourceCodePart[] => {
    const parts: SourceCodePart[] = exact ? [] : [{ text: 'Built from ' }];

    publishers.forEach(({ publisher, codes, more }, at) => {
        if (at > 0) {
            parts.push({ text: at === publishers.length - 1 ? ' and ' : ', ' });
        }

        parts.push({ text: `${publisher} ${codes.length + more === 1 ? 'code' : 'codes'} ` });
        codes.forEach((code, index) => {
            if (index > 0) {
                parts.push({ text: index === codes.length - 1 && more === 0 ? ' and ' : ', ' });
            }

            parts.push({ code });
        });

        if (more > 0) {
            parts.push({ text: ` and ${more} more` });
        }
    });

    return parts;
};

/** The codes to show as chips, across publishers, and how many more the
 *  groups count without listing. */
export const sourceCodeChips = ({
    publishers,
}: SourceCodeGroups): { codes: string[]; more: number } => ({
    codes: publishers.flatMap((publisher) => publisher.codes),
    more: publishers.reduce((total, publisher) => total + publisher.more, 0),
});

/** The sentence naming the codes as plain text. */
export const sourceCodeText = (groups: SourceCodeGroups): string =>
    sourceCodeParts(groups)
        .map((part) => ('code' in part ? part.code : part.text))
        .join('');
