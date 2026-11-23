// The definitions the page composes each count's from: graph nodes the build looks up in DFO,
// and two the OECD writes, quoted here because the graph has no node for them. Only type
// imports, so `node --test` loads the module.
import type { Definition } from '../_data/types.ts';

/** The graph nodes the page composes definitions from (`PARTS` and `PRICE_PART` in counts.ts). */
export const NODE_IDS: readonly string[] = [
    'Gross',
    'Net',
    'Disbursement',
    'Commitment',
    'grantEquivalent',
    'grantElement',
    'Nominal',
];

/** Labels for the graph nodes that carry none. */
const FALLBACK_LABELS: Readonly<Record<string, string>> = { Nominal: 'current prices' };

/** The OECD's own wording for the two definitions the graph has no node for. */
export const OECD_QUOTES: readonly Definition[] = [
    {
        id: 'oecdHeadline',
        label: 'OECD headline ODA',
        description:
            'Starting with 2018 data, the new grant equivalent measure of ODA became the standard for reporting, with the headline ODA figures published on that basis.',
        url: 'https://www.oecd.org/en/topics/sub-issues/oda-eligibility-and-conditions/official-development-assistance--definition-and-coverage.html',
        source: 'oecd',
    },
    {
        id: 'constantPrices',
        label: 'constant dollars',
        description:
            'In DAC publications, flow data are expressed in US dollars (USD). To give a truer idea of the volume of flows over time, data can be presented in constant prices and exchange rates, with a reference year specified. This means that adjustment has been made to cover both inflation in the donor’s currency between the year in question and the reference year, and changes in the exchange rate between that currency and the United States dollar over the same period.',
        url: 'https://www.oecd.org/en/topics/sub-issues/oda-standards/glossary-of-statistical-terms-and-concepts-of-development-finance.html',
        source: 'oecd',
    },
];

/** A graph node as the page reads it: its dcid, name and description. */
export type GraphDefinition = { id: string; name: string | null; description: unknown };

/**
 * The page's definitions: each graph node's label and description, in `nodes`' order, then the
 * OECD's quotes. A node without a name takes its label from FALLBACK_LABELS.
 *
 * @throws A node with no description, or with no name and no fallback label.
 */
export const definitionsFromNodes = (nodes: readonly GraphDefinition[]): Definition[] => {
    const graph = nodes.map(({ id, name, description }): Definition => {
        const label = name ?? FALLBACK_LABELS[id];

        if (typeof description !== 'string' || description === '') {
            throw new Error(`The graph returned no description for ${id}.`);
        }

        if (label === undefined) {
            throw new Error(`The graph returned no label for ${id}, and none is written.`);
        }

        return { id, label, description, source: 'graph' };
    });

    return [...graph, ...OECD_QUOTES];
};
