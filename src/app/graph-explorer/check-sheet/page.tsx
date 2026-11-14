import { Suspense } from 'react';

import CheckSheet from '@/components/organisms/CheckSheet/CheckSheet';

/** The Check a sheet page. The client organism reads the carried parameters from the URL query, so it renders inside Suspense. */
const CheckSheetPage = () => (
    <Suspense fallback={null}>
        <CheckSheet />
    </Suspense>
);

export default CheckSheetPage;
