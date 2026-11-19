import type { Metadata } from 'next';

import { pageOpenGraph, SITE_CARD, SITE_ORIGIN } from '@/lib/site';

/** The site's link-preview card by its full address. Next joins a
 *  root-relative image path onto the metadataBase path, /prototypes/, where
 *  no card exists. */
export const CARD = { ...SITE_CARD, url: `${SITE_ORIGIN}${SITE_CARD.url}` };

/** One published prototype. Its page is app/<slug>/page.mdx and it takes its
 *  metadata from this entry, so a title lives in one place. */
export type Prototype = {
    /** the folder under app/ and the path under /prototypes */
    slug: string;
    title: string;
    /** one or two sentences for the index and the link preview */
    summary: string;
    /** the publication date, YYYY-MM-DD */
    date: string;
};

/** Every prototype, newest first. */
export const prototypes: Prototype[] = [
    {
        slug: 'hiv-financing',
        title: 'Who provides external financing for HIV?',
        summary:
            'HIV aid from the United States, the Global Fund, and every other provider to 98 countries since 2015, set beside people living with HIV, treatment coverage, and AIDS-related deaths.',
        date: '2026-11-19',
    },
    {
        slug: 'fragility-finance',
        title: 'What external finance reaches fragile contexts?',
        summary:
            "ODA, other official flows, remittances, and FDI flowing into the OECD's 62 fragile contexts, debt service flowing out, and who gives the aid, for all 62, either tier, or one context.",
        date: '2026-11-18',
    },
    {
        slug: 'oda-counts',
        title: 'One donor, many ODA numbers',
        summary:
            "Every OECD count of a donor's aid side by side: gross disbursements, net disbursements, grant equivalents, commitments, and the OECD headline.",
        date: '2026-11-17',
    },
    {
        slug: 'debt-thresholds',
        title: 'Debt solvency and liquidity',
        summary:
            "FDL's test for risk of insolvency and illiquidity, run on the World Bank's latest debt data for 58 low and lower-middle-income countries.",
        date: '2026-11-16',
    },
];

/** The entry for a slug. Throws when the slug has none, so a page cannot
 *  build without its registry entry. */
export const prototype = (slug: string): Prototype => {
    const entry = prototypes.find((item) => item.slug === slug);

    if (!entry) {
        throw new Error(`No registry entry for prototype "${slug}" in prototypes/registry.ts`);
    }

    return entry;
};

/** A prototype page's metadata: its title and summary, with Open Graph tags
 *  so a shared link shows a card. */
export const prototypeMetadata = ({ title, summary }: Prototype): Metadata => ({
    title,
    description: summary,
    openGraph: pageOpenGraph({ title, description: summary, image: CARD }),
});
