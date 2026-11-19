import { Suspense } from 'react';

import SeedSheet from '@/components/organisms/SeedSheet/SeedSheet';

/** The Check a sheet page: Seed a dataset opened at its check step. The client organism reads the URL query, so it renders inside Suspense. */
const CheckSheetPage = () => (
    <Suspense fallback={null}>
        <SeedSheet openAt="check" />
    </Suspense>
);

export default CheckSheetPage;
