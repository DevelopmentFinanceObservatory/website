import { edit, remove } from '@/lib/library/admin';

// PATCH  /api/library/artifacts/<id> → { slug }, its text and topics changed
// DELETE /api/library/artifacts/<id> { replacedBy? } → 204
// Admins only (lib/library/admin has the gate).

type Context = { params: Promise<{ id: string }> };

export const PATCH = async (request: Request, { params }: Context) =>
    edit(request, (await params).id);

export const DELETE = async (request: Request, { params }: Context) =>
    remove(request, (await params).id);
