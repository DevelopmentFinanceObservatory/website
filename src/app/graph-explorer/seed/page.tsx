import { Suspense } from 'react';

import SeedSheet from '@/components/organisms/SeedSheet/SeedSheet';

/** The Seed a dataset page. The client organism reads its choices from the URL query, so it renders inside Suspense. */
const SeedPage = () => (
    <Suspense fallback={null}>
        <SeedSheet />
    </Suspense>
);

export default SeedPage;
