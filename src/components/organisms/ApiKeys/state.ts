/** What an API key form action answers with (src/app/(site)/account/api-keys/actions). */

/** A create form's state: the new key, once, or why there is none. Null before the first submit. */
export type CreatedState = {
    created?: { id: string; key: string };
    error?: string;
} | null;

/** A delete form's state: why it did not delete, or null. */
export type DeleteState = { error: string | null } | null;
