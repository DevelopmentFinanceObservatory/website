import { deleteKey } from '@/lib/apiKeys/account';

type Params = { params: Promise<{ keyId: string }> };

// DELETE /api/account/api-keys/:keyId → 204, or 404 for a key that is not the caller's

export const DELETE = async (request: Request, { params }: Params) =>
    deleteKey(request, (await params).keyId);
