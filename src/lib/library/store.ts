import 'server-only';

import { asc, desc, eq, inArray } from 'drizzle-orm';
import { cache } from 'react';

import {
    libraryArtifact,
    libraryArtifactTopic,
    libraryTopic,
    type LibraryArtifactRow,
} from '../../../db/schema.ts';

import type { ArtifactKind, ArtifactMode, LibraryArtifact } from './artifact.ts';

import { db } from '@/lib/db';

/**
 * The Library's artifacts, read from the website's own tables (db/schema.ts,
 * `library_artifact`), newest first, each with its topics by name.
 */

const topicsOf = async (ids: string[]): Promise<Map<string, string[]>> => {
    const byArtifact = new Map<string, string[]>();

    if (ids.length === 0) {
        return byArtifact;
    }

    const rows = await db
        .select({ artifactId: libraryArtifactTopic.artifactId, label: libraryTopic.label })
        .from(libraryArtifactTopic)
        .innerJoin(libraryTopic, eq(libraryTopic.id, libraryArtifactTopic.topicId))
        .where(inArray(libraryArtifactTopic.artifactId, ids))
        .orderBy(asc(libraryTopic.label));

    for (const row of rows) {
        byArtifact.set(row.artifactId, [...(byArtifact.get(row.artifactId) ?? []), row.label]);
    }

    return byArtifact;
};

// The check constraints on `kind` and `mode` hold the values to these.
const toArtifact = (row: LibraryArtifactRow, topics: string[]): LibraryArtifact => ({
    id: row.id,
    slug: row.slug,
    shareId: row.shareId,
    kind: row.kind as ArtifactKind,
    mode: row.mode as ArtifactMode,
    title: row.title,
    description: row.description,
    contentTitle: row.contentTitle,
    content: row.content,
    sources: row.sources,
    steps: row.steps,
    topics,
    publishedAt: row.publishedAt.toISOString(),
});

/** Every artifact, newest first. */
export const listArtifacts = async (): Promise<LibraryArtifact[]> => {
    const rows = await db.select().from(libraryArtifact).orderBy(desc(libraryArtifact.publishedAt));
    const topics = await topicsOf(rows.map((row) => row.id));

    return rows.map((row) => toArtifact(row, topics.get(row.id) ?? []));
};

/** The artifact published under `slug`, or null. One read per request,
 *  however many readers (the page and its metadata). */
export const artifactBySlug = cache(async (slug: string): Promise<LibraryArtifact | null> => {
    const [row] = await db.select().from(libraryArtifact).where(eq(libraryArtifact.slug, slug));

    if (!row) {
        return null;
    }

    return toArtifact(row, (await topicsOf([row.id])).get(row.id) ?? []);
});
