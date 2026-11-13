import { Suspense } from 'react';

import NewSheet from '@/components/organisms/NewSheet/NewSheet';

/** Start a sheet: the client organism reads its choices from the URL query, so it renders inside Suspense. */
const NewSheetPage = () => (
    <Suspense fallback={null}>
        <NewSheet />
    </Suspense>
);

export default NewSheetPage;
