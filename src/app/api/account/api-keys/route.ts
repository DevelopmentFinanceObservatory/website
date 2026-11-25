import { createKey, listKeys } from '@/lib/apiKeys/account';

// GET  /api/account/api-keys → the signed-in user's keys (ApiKeysData)
// POST /api/account/api-keys { label } → { key }, the new key, shown once
// Routes rather than server actions, since the account menu that opens the
// panel is also built into the prototypes app's static export, which refuses
// server actions. lib/apiKeys/account has the rules.

export const GET = (request: Request) => listKeys(request);

export const POST = (request: Request) => createKey(request);
