import type { Metadata } from 'next';

import NotFound from '@/components/organisms/NotFound/NotFound';

export const metadata: Metadata = { title: 'Page not found — DFO' };

// notFound() from a page inside the site (a missing source, section…) renders
// here, inside the site layout — so no chrome of its own. Unmatched URLs use
// the root not-found, which brings the chrome itself.
const SiteNotFoundPage = () => (
    <main>
        <NotFound />
    </main>
);

export default SiteNotFoundPage;
