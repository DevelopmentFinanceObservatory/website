import NotFound from '@/components/organisms/NotFound/NotFound';
import { NOT_FOUND_METADATA } from '@/lib/site';

export const metadata = NOT_FOUND_METADATA;

// notFound() from a page inside the site (a missing source, section…) renders
// here, inside the site layout — so no chrome of its own. Unmatched URLs use
// the root not-found, which brings the chrome itself.
const SiteNotFoundPage = () => (
    <main>
        <NotFound />
    </main>
);

export default SiteNotFoundPage;
