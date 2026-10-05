import { and, count, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { UPCOMING } from '@/components/organisms/Roadmap/roadmapData';
import { getUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { roadmapVote } from '../../../../../db/schema';

// Only entries still under consideration take votes.
const VOTABLE = new Set(UPCOMING.filter((e) => e.stage === 'consideration').map((e) => e.id));

// GET /api/roadmap/votes → { counts: { [entryId]: n }, mine: entryId[] }
// Counts are public; `mine` is empty without an account.
export const GET = async () => {
    const user = await getUser();
    const rows = await db
        .select({ entryId: roadmapVote.entryId, votes: count() })
        .from(roadmapVote)
        .groupBy(roadmapVote.entryId);
    const mine = user
        ? await db
              .select({ entryId: roadmapVote.entryId })
              .from(roadmapVote)
              .where(eq(roadmapVote.userId, user.id))
        : [];

    return NextResponse.json(
        {
            counts: Object.fromEntries(rows.map((row) => [row.entryId, row.votes])),
            mine: mine.map((row) => row.entryId),
        },
        { headers: { 'Cache-Control': 'no-store' } },
    );
};

// POST /api/roadmap/votes { entryId } → { voted } — toggles the signed-in
// user's vote on one entry. Voting needs an account: one vote per person.
export const POST = async (request: Request) => {
    const user = await getUser();

    if (!user) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { entryId?: unknown } | null;
    const entryId = typeof body?.entryId === 'string' ? body.entryId : '';

    if (!VOTABLE.has(entryId)) {
        return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const where = and(eq(roadmapVote.userId, user.id), eq(roadmapVote.entryId, entryId));
    const removed = await db.delete(roadmapVote).where(where).returning();

    if (removed.length === 0) {
        await db.insert(roadmapVote).values({ userId: user.id, entryId }).onConflictDoNothing();
    }

    return NextResponse.json({ voted: removed.length === 0 });
};
