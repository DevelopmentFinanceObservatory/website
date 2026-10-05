import { headers } from 'next/headers';
import { cache } from 'react';

import { auth } from '@/lib/auth/auth';

/**
 * The current session on the server (pages, route handlers). Cached per
 * request so a page and its data loaders share one lookup.
 */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** The signed-in user, or null. */
export const getUser = async () => (await getSession())?.user ?? null;
