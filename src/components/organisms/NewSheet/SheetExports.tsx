'use client';

import styles from './NewSheet.module.scss';

import Button from '@/components/atoms/Button/Button';
import { downloadCsv } from '@/components/organisms/GraphExplorer/downloadCsv';
import { authClient } from '@/lib/auth/client';
import {
    CONSENT_FAILED_STATE,
    consentReturns,
    rememberAnswer,
    shownCreateState,
    UNREACHED_STATE,
    type CreateMemory,
    type CreateState,
} from '@/lib/graphExplorer/googleConsent';
import { DRIVE_FILE_SCOPE, type SheetsAnswer } from '@/lib/graphExplorer/googleSheet';
import { SHEETS_ROUTE } from '@/lib/graphExplorer/paths';
import { draftCsvRows, sheetRequest, type SheetDraft } from '@/lib/graphExplorer/sheet';

/** Downloads the header row and the example rows as a CSV file. */
export const DownloadCsv = ({ sheet }: { sheet: SheetDraft }) => (
    <Button onClick={() => downloadCsv(draftCsvRows(sheet), sheet.fileName)}>Download CSV</Button>
);

/**
 * Sends the reader to Google's consent screen for the `drive.file` scope,
 * then back to this page with its query, so the sheet the reader built is
 * still there. The return carries RETURNED_PARAM when access was granted and
 * Better Auth's error otherwise (consentReturns). Returns false, after logging the error's code,
 * when the consent screen could not be opened.
 */
const continueWithGoogle = async (): Promise<boolean> => {
    try {
        const { error } = await authClient.linkSocial({
            provider: 'google',
            scopes: [DRIVE_FILE_SCOPE],
            ...consentReturns(window.location.href),
            // A refresh token comes only with a consent screen, and without one the
            // access lapses after an hour.
            additionalParams: { access_type: 'offline', prompt: 'consent' },
        });
        if (error === null) return true;
        console.error('graph explorer: linking Google failed', {
            code: error.code ?? null,
            status: error.status,
        });
    } catch (error) {
        console.error('graph explorer: linking Google failed', {
            code: error instanceof Error ? error.name : typeof error,
        });
    }
    return false;
};

type CreateGoogleSheetProps = {
    sheet: SheetDraft;
    /** The draft's query, which the control's states are recorded against. */
    query: string;
    memory: CreateMemory;
    onMemory: (update: (memory: CreateMemory) => CreateMemory) => void;
};

/**
 * Creates the sheet as a Google spreadsheet in the reader's own Drive, then
 * links to it. The handler's answer sets what is shown (answerState): the
 * consent screen when the tool has no access to the reader's Drive yet, Try
 * Again beside it when Better Auth failed to renew the access, and the
 * handler's message for every other refusal. After a trip through the
 * consent screen that the reader declined or that could not link, the
 * consent screen is offered again on the draft the reader returned to. The
 * trip judges the first answer after the return only (rememberAnswer). Each
 * state is recorded against the draft it was reached for, and shown while
 * that draft is current (shownCreateState).
 */
export const CreateGoogleSheet = ({ sheet, query, memory, onMemory }: CreateGoogleSheetProps) => {
    const state = shownCreateState(memory.record, query);
    const record = (reached: CreateState) =>
        onMemory((last) => ({ ...last, record: { query, state: reached } }));

    const create = async () => {
        record({ kind: 'working' });
        try {
            const response = await fetch(SHEETS_ROUTE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sheetRequest(sheet)),
            });
            const answer = (await response.json().catch(() => null)) as SheetsAnswer | null;
            onMemory((last) => rememberAnswer(last, query, answer));
        } catch {
            record(UNREACHED_STATE);
        }
    };

    const consent = async () => {
        if (!(await continueWithGoogle())) record(CONSENT_FAILED_STATE);
    };

    const offersConsent = state.kind === 'needs_google' || state.kind === 'renewal_failed';

    return (
        <>
            <Button onClick={create} disabled={state.kind === 'working'}>
                {state.kind === 'working' ? 'Creating…' : 'Create Google Sheet'}
            </Button>
            <p className={styles.exportStatus} role="status">
                {state.kind === 'working' && 'A Google Sheet is being created.'}
                {state.kind === 'created' && (
                    <>
                        <a href={state.url} target="_blank" rel="noopener noreferrer">
                            Open your new Google Sheet
                        </a>
                        {state.dropdownsFailed &&
                            '. Google did not add the dropdowns, so the property columns take any value. The value lists are on the second tab.'}
                    </>
                )}
                {(state.kind === 'failed' || offersConsent) && state.message}
            </p>
            {offersConsent && (
                <>
                    {state.kind === 'renewal_failed' && (
                        <Button variant="bordered" className={styles.exportAction} onClick={create}>
                            Try Again
                        </Button>
                    )}
                    <Button variant="bordered" className={styles.exportAction} onClick={consent}>
                        Continue with Google
                    </Button>
                </>
            )}
        </>
    );
};
