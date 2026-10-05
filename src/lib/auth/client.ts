import { createAuthClient } from 'better-auth/react';

/**
 * Browser-side auth: `useSession()` for the header/account state,
 * `signIn.social` (Google / GitHub / Microsoft — the only way in), `signOut`
 * and `deleteUser`. Talks to our own /api/auth/* — no third-party UI.
 */
export const authClient = createAuthClient();

export const { useSession, signIn, signOut, deleteUser } = authClient;
