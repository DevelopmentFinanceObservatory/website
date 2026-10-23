import { emailOTPClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Browser-side auth: `useSession()` for the header/account state,
 * `signIn.social` (Google / GitHub / Microsoft), `emailOtp` plus
 * `signIn.emailOtp` for an email code, `signOut` and `deleteUser`. Talks to
 * our own /api/auth/*, with no third-party UI.
 */
export const authClient = createAuthClient({ plugins: [emailOTPClient()] });

export const { useSession, signIn, signOut, deleteUser, emailOtp } = authClient;
