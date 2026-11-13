/**
 * Creating a mapping sheet in the reader's Google Drive, with every
 * collaborator passed in so `node --test` can drive each branch. The order
 * is fixed: the gate, then the body, then Google access, then Google.
 * Nothing reaches `fetch` before the gate admits the reader and the body
 * passes its bounds. The reader's token and Google's response bodies are
 * never logged or answered.
 */
import {
    createSpreadsheetBody,
    DRIVE_FILE_SCOPE,
    dropdownRequestBody,
    readSheetRequest,
    SHEETS_API,
    type SheetsAnswer,
} from './googleSheet.ts';

/** A linked sign-in account as Better Auth lists it. */
export type LinkedAccount = { id: string; providerId: string; scopes: readonly string[] };

export type GoogleAccessReason = 'no_google_account' | 'scope_missing' | 'token_unavailable';

export type GoogleAccess =
    { kind: 'ready'; accessToken: string } | { kind: 'missing'; reason: GoogleAccessReason };

/**
 * The Google account whose token can create the sheet: one granted the
 * `drive.file` scope, else the reason none can.
 */
export const chooseGoogleAccount = (
    accounts: readonly LinkedAccount[],
): LinkedAccount | Exclude<GoogleAccessReason, 'token_unavailable'> => {
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

/** The request body as the handler read it: parsed JSON, or refused for its size or syntax. */
export type ReadBody = { ok: true; value: unknown } | { ok: false };

export type SheetsExportDeps = {
    /** The gate's decision for the request. */
    decide: () => Promise<{
        kind: 'admitted' | 'signed_out' | 'email_not_verified' | 'domain_not_allowed';
    }>;
    readBody: () => Promise<ReadBody>;
    googleAccess: () => Promise<GoogleAccess>;
    fetch: typeof fetch;
    /** The date for the sheet's note, `YYYY-MM-DD`. */
    today: string;
    /** Receives a message and the HTTP status Google answered; nothing else. */
    log: (message: string, fields: { status: number | null }) => void;
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
        message: 'Creating a Google Sheet needs permission to add files to your Google Drive.',
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
 * The handler's answer. Google answering 401 on create means the token no
 * longer works, so the reader is asked to grant access again (409); any
 * other Google failure is a 502. When the sheet exists but its dropdowns
 * could not be added, the answer is still the sheet, with `dropdowns:
 * 'failed'`.
 */
export const createGoogleSheet = async (deps: SheetsExportDeps): Promise<SheetsExportResult> => {
    const decision = await deps.decide();
    switch (decision.kind) {
        case 'admitted':
            break;
        case 'signed_out':
            return refused(401, {
                ok: false,
                code: 'signed_out',
                message: 'Sign in to create a sheet.',
            });
        case 'email_not_verified':
            return refused(403, {
                ok: false,
                code: 'email_not_verified',
                message: 'Your email address is not verified yet.',
            });
        case 'domain_not_allowed':
            return refused(403, {
                ok: false,
                code: 'domain_not_allowed',
                message: 'Your account’s email domain does not have access to the Graph Explorer.',
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
    } catch {
        deps.log('sheets export: create request failed', { status: null });
        return googleFailed;
    }
    if (!created.ok) {
        deps.log('sheets export: Google refused create', { status: created.status });
        return created.status === 401 ? accessNeeded('token_unavailable') : googleFailed;
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
            deps.log('sheets export: Google refused dropdowns', { status: updated.status });
            return { status: 200, body: { ok: true, url: sheet.url, dropdowns: 'failed' } };
        }
    } catch {
        deps.log('sheets export: dropdown request failed', { status: null });
        return { status: 200, body: { ok: true, url: sheet.url, dropdowns: 'failed' } };
    }
    return { status: 200, body: { ok: true, url: sheet.url, dropdowns: 'added' } };
};
