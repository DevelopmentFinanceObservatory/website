'use client';

import SourcesError from '@/components/organisms/Sources/SourcesError';

// A failed graph read throws while the page renders (lib/sources/graph.ts).
// This boundary sits inside the site layout, so the header and footer stay.
// It covers the index and the source pages below it.
const SourcesErrorPage = ({ retry }: { retry: () => void }) => <SourcesError retry={retry} />;

export default SourcesErrorPage;
