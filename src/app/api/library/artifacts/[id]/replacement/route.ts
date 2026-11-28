import { replace } from '@/lib/library/admin';

// PUT /api/library/artifacts/<id>/replacement { replacedBy } → { slug }, the
// artifact a withdrawn one's address links to, set, changed or cleared.
// Admins only (lib/library/admin has the gate).

type Context = { params: Promise<{ id: string }> };

export const PUT = async (request: Request, { params }: Context) =>
    replace(request, (await params).id);
