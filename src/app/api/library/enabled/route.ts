import { libraryEnabled } from '@/lib/library/enabled';

// GET /api/library/enabled → { enabled }, whether the Library is open to
// everyone (LIBRARY_ENABLED). Public, unlike the other /api/library routes:
// the footer asks it, since the footer of a page prerendered at build time
// cannot read the running server's environment. Browsers keep the answer
// for five minutes.

export const dynamic = 'force-dynamic';

export const GET = () =>
    Response.json(
        { enabled: libraryEnabled() },
        { headers: { 'Cache-Control': 'public, max-age=300' } },
    );
