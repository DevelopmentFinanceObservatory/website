import BuildTools from '@/components/organisms/BuildTools/BuildTools';
import CreateCanvas from '@/components/organisms/CreateCanvas/CreateCanvas';
import DownloadDataset from '@/components/organisms/DownloadDataset/DownloadDataset';
import Hero from '@/components/organisms/Hero/Hero';
import { loadSearchCatalogue } from '@/lib/search/catalogueLoader';

// Static between reads, rebuilt at most every five minutes. A build the API
// cannot answer renders without counts (loadSearchCatalogue returns null), and
// the next revalidation fills them in.
export const revalidate = 300;

const Home = async () => {
    const catalogue = await loadSearchCatalogue();

    return (
        <main>
            <Hero
                lines={['Development Finance', 'Data. Simplified.']}
                phoneLines={['Development', 'Finance Data.', 'Simplified.']}
                scrollLabel="Get Started"
                scrollHref="#content"
                description="The DFO integrates aid, debt, climate and health finance, domestic budgets, and remittances into a single open platform, where every number is traceable to its source."
                credit={{
                    label: 'Built on Data Commons by Google',
                    href: 'https://datacommons.org',
                }}
            />
            <CreateCanvas />
            <DownloadDataset catalogue={catalogue} />
            <BuildTools />
            {/* "Get inspired by what others are building" is out until there
                is real work to show: the component stays in
                components/organisms/BuiltWith, ready to mount again. */}
        </main>
    );
};

export default Home;
