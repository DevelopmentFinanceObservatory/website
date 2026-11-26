import { publish } from '@/lib/library/admin';

// POST /api/library/artifacts → { slug }, the artifact published from a share.
// Admins only (lib/library/admin has the gate).

export const POST = (request: Request) => publish(request);
