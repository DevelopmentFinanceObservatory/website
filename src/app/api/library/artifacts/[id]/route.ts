import { edit, remove, stored } from '@/lib/library/admin';

// GET    /api/library/artifacts/<id> → its stored text, topics and revision
// PATCH  /api/library/artifacts/<id> → { slug, revision, warnings }, its text and topics changed
// DELETE /api/library/artifacts/<id> { replacedBy? } → 204
// Admins only (lib/library/admin has the gate).

type Context = { params: Promise<{ id: string }> };

export const GET = async (request: Request, { params }: Context) =>
    stored(request, (await params).id);

export const PATCH = async (request: Request, { params }: Context) =>
    edit(request, (await params).id);

export const DELETE = async (request: Request, { params }: Context) =>
    remove(request, (await params).id);
