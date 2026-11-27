import 'server-only';

import { readLibraryEnabled } from './switch';

/**
 * LIBRARY_ENABLED, read on each call, so a change to the Cloud Run service's
 * environment takes effect on its next revision with no rebuild. Only the
 * server reads it: the pages and the sitemap that use it render per request,
 * and the footer asks GET /api/library/enabled.
 */
export const libraryEnabled = (): boolean => readLibraryEnabled(process.env.LIBRARY_ENABLED);
