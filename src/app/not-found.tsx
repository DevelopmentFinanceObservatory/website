import type { Metadata } from 'next';

import Footer from '@/components/organisms/Footer/Footer';
import Header from '@/components/organisms/Header/Header';
import NotFound from '@/components/organisms/NotFound/NotFound';

export const metadata: Metadata = { title: 'Page not found — DFO' };

// Unmatched routes land here, outside the (site) group, so the chrome is
// added explicitly.
const NotFoundPage = () => (
    <>
        <Header />
        <main>
            <NotFound />
        </main>
        <Footer />
    </>
);

export default NotFoundPage;
