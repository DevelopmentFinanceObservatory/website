/**
 * Insights → Publications: research built on the DFO knowledge graph. The
 * two launch reports from the design, with the live links the DFO team
 * handed over — View Report opens the report on data.one.org. A future
 * publication with no link yet leaves `reportUrl` null and its button is
 * simply not offered.
 */

export type Publication = {
    id: string;
    title: string;
    byline: string;
    date: string;
    abstract: string;
    reportUrl: string | null;
    // The report's cover artwork (design handoff, public/images/publications).
    coverSrc: string;
};

export const PUBLICATIONS: Publication[] = [
    {
        id: 'great-reversal',
        title: 'The Great Reversal: Multilaterals Step up Finance to Developing Countries as China Steps Back',
        byline: 'Data.one.org Research Team',
        date: 'January 27, 2026',
        abstract:
            "For the first time since 2000, more money is flowing out of developing countries than into them. Drawing on DFO's matched creditor-debtor data, the report finds that in 2023, 38 low-income countries paid more in debt service than they received in new disbursements, while aid grants fell to a record-low 22% of total flows. The conventional picture of development finance — focused on gross commitments — obscures a reversal that has been building for years.",
        reportUrl: 'https://data.one.org/resources/report/greatreversal',
        coverSrc: '/images/publications/the-great-reversal.svg',
    },
    {
        id: 'priced-out',
        title: 'Priced Out: The Rising Cost of Borrowing for Low- and Lower-Middle-Income Countries',
        byline: 'Sara Harcourt, Miguel Haro Ruiz, Jorge Rivera',
        date: 'April 14, 2026',
        abstract:
            'Since COVID and the Ukraine war sent global rates to multi-decade highs, the cost of borrowing for developing countries has surged across every creditor type — the average for African countries nearly doubled between 2020 and 2024. Countries like Kenya, Ghana, and Senegal, caught between full concessional protection and market access, bore the sharpest squeeze: when they turned to bond markets instead of multilateral lenders, they paid $22–$61 more per $100 borrowed. The paper calls for expanded MDB lending, faster debt restructuring, and protecting IDA — arguing these are now essential, not optional.',
        reportUrl: 'https://data.one.org/analysis/priced-out-borrowing-costs-developing-countries',
        coverSrc: '/images/publications/priced-out.svg',
    },
];
