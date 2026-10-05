import { isCloudSqlConfigured } from '../../../db/connection';
import { feedback } from '../../../db/schema';
import { db } from '@/lib/db';

// Storage half of the feedback backend, riding the same shared pool as accounts and conversations (src/lib/db), so it inherits the whole connection story: DATABASE_URL locally, Cloud SQL over IAM when deployed.
// Neither configured means storage is off and the route falls back to the notification sinks alone.

export const storageConfigured = (): boolean =>
    isCloudSqlConfigured() || Boolean(process.env.DATABASE_URL);

export interface FeedbackRecord {
    message: string;
    email: string | null;
    page: string | null;
    userAgent: string | null;
}

export const storeFeedback = async (record: FeedbackRecord): Promise<number> => {
    const rows = await db
        .insert(feedback)
        .values({
            message: record.message,
            email: record.email,
            page: record.page,
            userAgent: record.userAgent,
        })
        .returning({ id: feedback.id });
    return rows[0].id;
};
