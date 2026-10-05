import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { SavedConversation } from '@/lib/chat/history';

/**
 * A gallery item's session: the saved conversation curated into
 * `src/content/gallery/<slug>.json`. Read from disk at build time, like the
 * docs corpus — a gallery page owes nothing to the database, so it renders
 * the same everywhere and can be crawled.
 */
export const gallerySession = (slug: string): SavedConversation =>
    JSON.parse(
        readFileSync(path.join(process.cwd(), 'src/content/gallery', `${slug}.json`), 'utf8'),
    ) as SavedConversation;
