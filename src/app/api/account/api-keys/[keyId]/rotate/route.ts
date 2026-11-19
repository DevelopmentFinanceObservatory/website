import { rotateKey } from '@/lib/apiKeys/account';

type Params = { params: Promise<{ keyId: string }> };

// POST /api/account/api-keys/:keyId/rotate → { key }, the replacement, shown once

export const POST = async (request: Request, { params }: Params) =>
    rotateKey(request, (await params).keyId);
