/**
 * Creating a mapping sheet in the reader's Google Drive, with every
 * collaborator passed in so `node --test` can drive each branch. The order
 * is fixed: the gate, then the body, then Google access, then Google.
 * Nothing reaches `fetch` before the gate admits the reader and the body
 * passes its bounds. The reader's token and Google's response bodies are
 * never logged or answered.
 */
import { asRecord } from '../asRecord.ts';
import { REFUSAL_MESSAGES, type ReaderDecision } from '../auth/reader.ts';
import {
    createSpreadsheetBody,
    DRIVE_FILE_SCOPE,
    dropdownRequestBody,
    readSheetRequest,
    SHEETS_API,
    type GoogleAccessReason,
    type SheetsAnswer,
} from './googleSheet.ts';

/** A linked sign-in account as Better Auth lists it. */
export type LinkedAccount = { id: string; providerId: string; scopes: readonly string[] };

/** The step of the Google token read that failed. */
export type GoogleAccessStep = 'list_accounts' | 'access_token';

/**
 * The Google token read: a token, a GoogleAccessReason the reader can mend
 * by granting access, or a failure. A renewal Better Auth attempted and
 * failed is `renewal_failed`, apart from the reasons, since its cause is unknown.
 */
export type GoogleAccess =
    | { kind: 'ready'; accessToken: string }
    | { kind: 'missing'; reason: GoogleAccessReason }
    /**
     * Better Auth failed to read or renew the token: a refused refresh, a
     * Google outage, a failed write of the renewed token or a failed
     * decryption, which its error does not tell apart. `cause` names the
     * error for the log and carries no token.
     */
    | { kind: 'renewal_failed'; cause: string }
    | { kind: 'failed'; step: GoogleAccessStep; cause: string };

/** What the reader is told for each reason, with what Continue with Google will do. */
export const GOOGLE_ACCESS_MESSAGES: Readonly<Record<GoogleAccessReason, string>> = {
    no_google_account:
        'Creating a Google Sheet needs a Google account linked to this one. Continue with Google to link it and let the tool add files to your Drive. It sees only the files it creates.',
    scope_missing:
        'Creating a Google Sheet needs permission to add files to your Google Drive. Continue with Google to grant it. The tool sees only the files it creates.',
    token_expired:
        'The tool’s access to your Google Drive has lapsed and cannot be renewed. Continue with Google to grant it again.',
};

/**
 * The Google account whose token can create the sheet: one granted the
 * `drive.file` scope, else the reason none can.
 */
export const chooseGoogleAccount = (
    accounts: readonly LinkedAccount[],
): LinkedAccount | Exclude<GoogleAccessReason, 'token_expired'> => {
    const google = accounts.filter((account) => account.providerId === 'google');
    if (google.length === 0) return 'no_google_account';
    return google.find((account) => account.scopes.includes(DRIVE_FILE_SCOPE)) ?? 'scope_missing';
};

/**
 * Whether a token Better Auth hands back can be used: non-empty and not
 * past its expiry. Better Auth returns the stored token unchanged when it
 * has expired and there is no refresh token to renew it with.
 */
export const isUsableToken = (
    token: { accessToken?: string; accessTokenExpiresAt?: Date | string },
    now: Date,
): token is { accessToken: string } => {
    if (!token.accessToken) return false;
    if (token.accessTokenExpiresAt === undefined) return true;
    return new Date(token.accessTokenExpiresAt).getTime() > now.getTime();
};

/**
 * Better Auth's error code for any failure inside its token read: a refused
 * refresh, a failed write of the renewed token, or a failed decryption.
 */
const RENEWAL_FAILED = 'FAILED_TO_GET_ACCESS_TOKEN';

/**
 * An error named for the log: its name, the Better Auth code or HTTP status
 * it carries, and the code of its `cause` (a failed `fetch` carries the
 * network error's, such as `ENOTFOUND`). The message is left out because it
 * can quote a failed query.
 */
export const errorCause = (error: unknown): string => {
    const record = asRecord(error);
    const name = error instanceof Error ? error.name : typeof error;
    const code = asRecord(record?.body)?.code;
    const status = record?.statusCode ?? record?.status;
    const causeCode = asRecord(record?.cause)?.code;
    return [
        name,
        typeof code === 'string' ? code : null,
        typeof status === 'number' || typeof status === 'string' ? String(status) : null,
        typeof causeCode === 'string' ? causeCode : null,
    ]
        .filter((part) => part !== null)
        .join(' ');
};

/** An enum value in Google's error body, such as `PERMISSION_DENIED`. */
const GOOGLE_ENUM = /^[A-Z][A-Z0-9_]{0,63}$/;

/**
 * A Google refusal named for the log: the body's `error.status` and each
 * `error.details[].reason`, such as `PERMISSION_DENIED SERVICE_DISABLED`,
 * or undefined when the body carries neither. Only values shaped as Google's
 * enums are logged, so nothing else from the body reaches the log.
 */
const googleRefusalCause = async (response: Response): Promise<string | undefined> => {
    const error = asRecord(asRecord(await response.json().catch(() => null))?.error);
    const details: unknown[] = Array.isArray(error?.details) ? error.details : [];
    const parts = [error?.status, ...details.map((detail) => asRecord(detail)?.reason)].filter(
        (part): part is string => typeof part === 'string' && GOOGLE_ENUM.test(part),
    );
    return parts.length > 0 ? parts.join(' ') : undefined;
};

export type GoogleAccessDeps = {
    /** The signed-in reader's linked accounts (Better Auth's listUserAccounts). */
    listAccounts: () => Promise<readonly LinkedAccount[]>;
    /** A token for one account, renewed when it is about to expire (Better Auth's getAccessToken). */
    accessToken: (
        accountId: string,
    ) => Promise<{ accessToken?: string; accessTokenExpiresAt?: Date | string }>;
    now: Date;
};

/**
 * The reader's Google access token, or why there is none. Better Auth's
 * `FAILED_TO_GET_ACCESS_TOKEN` reads as `renewal_failed`: it raises that
 * one code for a refused refresh, a Google outage, a storage failure and a
 * decryption failure alike, and discards the cause. Any other throw from
 * either call is a failure of the auth call itself. The handler logs both
 * and answers each as an error.
 */
export const readGoogleAccessWith = async (deps: GoogleAccessDeps): Promise<GoogleAccess> => {
    let accounts: readonly LinkedAccount[];
    try {
        accounts = await deps.listAccounts();
    } catch (error) {
        return { kind: 'failed', step: 'list_accounts', cause: errorCause(error) };
    }
    const account = chooseGoogleAccount(accounts);
    if (typeof account === 'string') return { kind: 'missing', reason: account };

    let token: Awaited<ReturnType<GoogleAccessDeps['accessToken']>>;
    try {
        token = await deps.accessToken(account.id);
    } catch (error) {
        if (asRecord(asRecord(error)?.body)?.code === RENEWAL_FAILED) {
            return { kind: 'renewal_failed', cause: errorCause(error) };
        }
        return { kind: 'failed', step: 'access_token', cause: errorCause(error) };
    }
    return isUsableToken(token, deps.now)
        ? { kind: 'ready', accessToken: token.accessToken }
        : { kind: 'missing', reason: 'token_expired' };
};

/** The request body as the handler read it: parsed JSON, or refused for its size or syntax. */
export type ReadBody = { ok: true; value: unknown } | { ok: false };

export type SheetsExportDeps = {
    /** The gate's decision for the request. */
    decide: () => Promise<{ kind: ReaderDecision['kind'] }>;
    readBody: () => Promise<ReadBody>;
    googleAccess: () => Promise<GoogleAccess>;
    fetch: typeof fetch;
    /** The date for the sheet's note, `YYYY-MM-DD`. */
    today: string;
    /**
     * Receives a message, the HTTP status Google answered and the cause. For
     * a thrown call the cause is the error's name and codes (errorCause), and
     * for a Google refusal the enums in its error body (googleRefusalCause).
     * It receives no token or body.
     */
    log: (message: string, fields: { status: number | null; cause?: string }) => void;
};

export type SheetsExportResult = { status: number; body: SheetsAnswer };

const GOOGLE_TIMEOUT_MS = 20_000;

const SHEET_URL = /^https:\/\/docs\.google\.com\/spreadsheets\//;

const refused = (status: number, body: SheetsAnswer): SheetsExportResult => ({ status, body });

const googleFailed = refused(502, {
    ok: false,
    code: 'google_failed',
    message: 'Google could not create the sheet. Try again in a minute.',
});

const accessNeeded = (reason: GoogleAccessReason): SheetsExportResult =>
    refused(409, {
        ok: false,
        code: 'google_access_needed',
        reason,
        message: GOOGLE_ACCESS_MESSAGES[reason],
    });

const authFailed = refused(502, {
    ok: false,
    code: 'auth_failed',
    message: 'The sign-in service could not read your Google access. Try again in a minute.',
});

const renewalFailed = refused(502, {
    ok: false,
    code: 'google_renewal_failed',
    message:
        'The sign-in service could not renew the tool’s access to your Google Drive. Try again in a minute, or Continue with Google to grant it again.',
});

/** The new spreadsheet's id and a docs.google.com address for it, from the create response. */
const readCreated = async (response: Response): Promise<{ id: string; url: string } | null> => {
    const body: unknown = await response.json().catch(() => null);
    if (typeof body !== 'object' || body === null) return null;
    const { spreadsheetId, spreadsheetUrl } = body as Record<string, unknown>;
    if (typeof spreadsheetId !== 'string' || !/^[\w-]+$/.test(spreadsheetId)) return null;
    const url =
        typeof spreadsheetUrl === 'string' && SHEET_URL.test(spreadsheetUrl)
            ? spreadsheetUrl
            : `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    return { id: spreadsheetId, url };
};

/**
 * The handler's answer. A reason to grant Google access answers 409
 * `google_access_needed`, and so does Google answering 401 on create, since
 * the token does not work. A failed token read in Better Auth answers 502
 * `google_renewal_failed`, a failed auth call 502 `auth_failed`, and any
 * other Google failure 502 `google_failed`, each logged with its cause. When
 * the sheet exists but its dropdowns could not be added, the answer is the
 * sheet, with `dropdowns: 'failed'`.
 */
export const createGoogleSheet = async (deps: SheetsExportDeps): Promise<SheetsExportResult> => {
    const decision = await deps.decide();
    switch (decision.kind) {
        case 'admitted':
            break;
        case 'signed_out':
        case 'email_not_verified':
        case 'domain_not_allowed':
            return refused(decision.kind === 'signed_out' ? 401 : 403, {
                ok: false,
                code: decision.kind,
                message: REFUSAL_MESSAGES[decision.kind],
            });
    }

    const raw = await deps.readBody();
    const request = raw.ok ? readSheetRequest(raw.value) : null;
    if (request === null) {
        return refused(400, {
            ok: false,
            code: 'invalid_body',
            message: 'The sheet was too large or not in the expected form.',
        });
    }

    const access = await deps.googleAccess();
    if (access.kind === 'failed') {
        deps.log(`sheets export: reading Google access failed at ${access.step}`, {
            status: null,
            cause: access.cause,
        });
        return authFailed;
    }
    if (access.kind === 'renewal_failed') {
        deps.log(
            'sheets export: Google token read failed in Better Auth (refresh, storage or decryption)',
            { status: null, cause: access.cause },
        );
        return renewalFailed;
    }
    if (access.kind === 'missing') return accessNeeded(access.reason);

    const call = (url: string, body: unknown) =>
        deps.fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${access.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
        });

    let created: Response;
    try {
        created = await call(
            `${SHEETS_API}?fields=spreadsheetId,spreadsheetUrl`,
            createSpreadsheetBody(request, deps.today),
        );
    } catch (error) {
        deps.log('sheets export: create request failed', {
            status: null,
            cause: errorCause(error),
        });
        return googleFailed;
    }
    if (!created.ok) {
        deps.log('sheets export: Google refused create', {
            status: created.status,
            cause: await googleRefusalCause(created),
        });
        return created.status === 401 ? accessNeeded('token_expired') : googleFailed;
    }
    const sheet = await readCreated(created);
    if (sheet === null) {
        deps.log('sheets export: create response unreadable', { status: created.status });
        return googleFailed;
    }

    const dropdowns = dropdownRequestBody(request);
    if (dropdowns === null) {
        return { status: 200, body: { ok: true, url: sheet.url, dropdowns: 'none' } };
    }
    try {
        const updated = await call(
            `${SHEETS_API}/${encodeURIComponent(sheet.id)}:batchUpdate`,
            dropdowns,
        );
        if (!updated.ok) {
            deps.log('sheets export: Google refused dropdowns', {
                status: updated.status,
                cause: await googleRefusalCause(updated),
            });
            return { status: 200, body: { ok: true, url: sheet.url, dropdowns: 'failed' } };
        }
    } catch (error) {
        deps.log('sheets export: dropdown request failed', {
            status: null,
            cause: errorCause(error),
        });
        return { status: 200, body: { ok: true, url: sheet.url, dropdowns: 'failed' } };
    }
    return { status: 200, body: { ok: true, url: sheet.url, dropdowns: 'added' } };
};
