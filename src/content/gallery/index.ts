import type { GalleryItem } from '@/components/organisms/Gallery/galleryData';

const items = [
    {
        slug: 'china-debt-service-africa',
        kind: 'canvas',
        title: 'Debt service paid to China by African countries',
        description:
            "An analysis of debt service paid to China by African countries between 2010 and 2024 using data from World Bank's International Debt Statistics.",
        types: ['charts'],
        regions: ['africa'],
        sources: ['wb-ids'],
        sharedFrom: 'upYQIqiL',
        live: true,
    },
    {
        slug: 'dac-in-donor-refugee-costs',
        kind: 'card',
        title: 'In-donor refugee costs as a share of total ODA',
        description:
            "A ranking of DAC countries' domestic refugee costs compared to their total ODA spending over the last decade, with data from the OECD DAC1 table.",
        types: ['charts'],
        regions: ['dac'],
        sources: ['oecd-dac'],
        sharedFrom: 'yvuDeHc4',
        live: true,
    },
    {
        slug: 'sudan-humanitarian-aid-per-idp',
        kind: 'card',
        title: 'Humanitarian aid to Sudan per internally displaced person',
        description:
            'A visualisation of humanitarian aid spent per internally displaced person in Sudan over the last decade, with data from the OECD DAC1 and SDG Global Database.',
        types: ['charts'],
        regions: ['africa', 'ssa'],
        sources: ['oecd-dac', 'un-sdg'],
        sharedFrom: 'kng5T7HJ',
        live: true,
    },
    {
        slug: 'health-aid-child-mortality',
        kind: 'conversation',
        title: 'Does health aid go where children are dying?',
        description:
            "An analysis of health aid disbursements per capita, with data from the OECD's CRS database and the World Bank's World Development Indicators in comparison to under-five mortality rate from the SDG Global Database.",
        types: ['charts'],
        regions: ['africa'],
        sources: ['oecd-crs', 'wb-wdi', 'un-sdg'],
        sharedFrom: '02ZGDaPn',
    },
    {
        slug: 'dac-oda-gni',
        kind: 'dataset',
        title: 'ODA as a share of GNI for DAC countries',
        description:
            'Grant equivalents as a percentage of GNI for DAC countries between 2018 and 2025, from the OECD DAC1 table.',
        types: ['tables'],
        regions: ['dac'],
        sources: ['oecd-dac'],
        sharedFrom: 'ZmZiSa2C',
    },
    {
        slug: 'access-to-electricity',
        kind: 'dataset',
        title: 'Access to electricity',
        description:
            'Share of the population with electricity access by country between 1990 and 2023, from the World Bank.',
        types: ['tables'],
        regions: ['global'],
        sources: ['wb-wdi'],
        sharedFrom: 'hMAdgDgD',
    },
    {
        slug: 'hiv-eastern-africa',
        kind: 'canvas',
        title: 'HIV in Eastern Africa',
        description:
            'A line chart of new HIV infections since 2000, from the SDG Global Database, and a ranking of the top 10 donors of aid for STD control, from the OECD CRS database.',
        types: ['charts'],
        regions: ['africa', 'ssa'],
        sources: ['un-sdg', 'oecd-crs'],
        sharedFrom: '4M8WwZFV',
        live: true,
    },
    {
        slug: 'ghana-debt-indicators',
        kind: 'canvas',
        title: 'Key debt indicators for Ghana',
        description:
            "Four charts from World Bank International Debt Statistics: Ghana's external debt stocks and debt service from 2002 to 2024, in dollars and against GNI and exports.",
        types: ['charts'],
        regions: ['africa', 'ssa'],
        sources: ['wb-ids'],
        sharedFrom: 'Rpcqpj2Q',
    },
    {
        slug: 'nigeria-multilateral-health-aid',
        kind: 'dataset',
        title: 'Latest imputed multilateral aid for health to Nigeria',
        description:
            "ONE's estimate of the health aid donors send to Nigeria through multilateral agencies, built from OECD data and refreshed as the sources update.",
        types: ['tables'],
        regions: ['africa', 'ssa'],
        sources: ['one'],
        sharedFrom: 'F6U11JLb',
    },
    {
        slug: 'g7-outward-remittances',
        kind: 'dataset',
        title: 'Outward remittances for G7 countries',
        description:
            "Remittances paid out of the seven G7 economies each year since 1970, in US dollars, from the World Bank's World Development Indicators.",
        types: ['tables'],
        regions: ['g7'],
        sources: ['wb-wdi'],
        sharedFrom: 'UISlvsXE',
    },
] satisfies readonly GalleryItem[];

export default items;
