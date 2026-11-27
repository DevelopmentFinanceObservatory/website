import { createTopic, topics } from '@/lib/library/admin';

// GET  /api/library/topics → { topics }, every topic's label
// POST /api/library/topics { label } → { topics }, with the new one
// Admins only (lib/library/admin has the gate).

export const GET = (request: Request) => topics(request);

export const POST = (request: Request) => createTopic(request);
