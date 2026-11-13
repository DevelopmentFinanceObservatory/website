'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import styles from './NewSheet.module.scss';

import Button from '@/components/atoms/Button/Button';
import { downloadCsv } from '@/components/organisms/GraphExplorer/downloadCsv';
import { authClient } from '@/lib/auth/client';
import { DRIVE_FILE_SCOPE, type SheetsAnswer } from '@/lib/graphExplorer/googleSheet';
import { SHEETS_ROUTE } from '@/lib/graphExplorer/paths';
import { draftCsvRows, sheetRequest, type SheetDraft } from '@/lib/graphExplorer/sheet';

/** Downloads the header row and the example rows as a CSV file. */
export const DownloadCsv = ({ sheet }: { sheet: SheetDraft }) => (
    <Button onClick={() => downloadCsv(draftCsvRows(sheet), sheet.fileName)}>Download CSV</Button>
);

/** The parameter Better Auth adds to the return address when Google access was not granted. */
const LINK_ERROR_PARAM = 'error';

/** The parameter on the return address after a trip through Google's consent screen. */
const RETURNED_PARAM = 'google';

type CreateState =
    | { kind: 'idle' }
    | { kind: 'working' }
    | { kind: 'created'; url: string; dropdownsFailed: boolean }
    | { kind: 'needs_google'; message: string }
    | { kind: 'failed'; message: string };

/** What the reader is told when access was just granted and the handler still asks for it. */
const STILL_REFUSED =
    'Google access was granted, but the tool still cannot use it, so no sheet was created. Sign out, sign in again and try once more; if it fails again, download the CSV.';

/**
 * Sends Google's consent screen for the `drive.file` scope, then returns to
 * this page with its query and RETURNED_PARAM, so the sheet the reader built
 * is still there and the page knows the trip was made.
 */
const continueWithGoogle = async () => {
    const back = new URL(window.location.href);
    back.searchParams.delete(LINK_ERROR_PARAM);
    back.searchParams.set(RETURNED_PARAM, '1');
    const here = `${back.pathname}${back.search}`;
    await authClient.linkSocial({
        provider: 'google',
        scopes: [DRIVE_FILE_SCOPE],
        callbackURL: here,
        errorCallbackURL: here,
        // A refresh token comes only with a consent screen, and without one the
        // access lapses after an hour.
        additionalParams: { access_type: 'offline', prompt: 'consent' },
    });
};

/**
 * Creates the sheet as a Google spreadsheet in the reader's own Drive, then
 * links to it. When the tool has no access to the reader's Drive yet, it
 * shows the handler's reason and offers Google's consent screen on a click;
 * after one trip through it that still ends in a refusal, it says so and
 * offers the button no more. Every other refusal shows the handler's message.
 */
export const CreateGoogleSheet = ({ sheet }: { sheet: SheetDraft }) => {
    const params = useSearchParams();
    const linkFailed = params.has(LINK_ERROR_PARAM);
    const returned = params.has(RETURNED_PARAM);
    const [state, setState] = useState<CreateState>({ kind: 'idle' });

    const create = async () => {
        setState({ kind: 'working' });
        try {
            const response = await fetch(SHEETS_ROUTE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sheetRequest(sheet)),
            });
            const answer = (await response.json().catch(() => null)) as SheetsAnswer | null;
            if (answer?.ok) {
                setState({
                    kind: 'created',
                    url: answer.url,
                    dropdownsFailed: answer.dropdowns === 'failed',
                });
            } else if (answer?.code === 'google_access_needed') {
                setState(
                    returned
                        ? { kind: 'failed', message: STILL_REFUSED }
                        : { kind: 'needs_google', message: answer.message },
                );
            } else {
                setState({
                    kind: 'failed',
                    message: answer?.message ?? 'The sheet could not be created. Try again.',
                });
            }
        } catch {
            setState({
                kind: 'failed',
                message: 'The sheet could not be created. Check your connection and try again.',
            });
        }
    };

    return (
        <>
            <Button onClick={create} disabled={state.kind === 'working'}>
                {state.kind === 'working' ? 'Creating…' : 'Create Google Sheet'}
            </Button>
            <p className={styles.exportStatus} role="status">
                {state.kind === 'created' && (
                    <>
                        <a href={state.url} target="_blank" rel="noopener noreferrer">
                            Open your new Google Sheet
                        </a>
                        {state.dropdownsFailed &&
                            '. Google did not add the dropdowns, so the property columns take any value; the value lists are on the second tab.'}
                    </>
                )}
                {state.kind === 'failed' && state.message}
                {state.kind === 'idle' &&
                    linkFailed &&
                    'Google access was not granted, so no sheet was created.'}
            </p>
            {state.kind === 'needs_google' && (
                <>
                    <p className={styles.exportStatus}>{state.message}</p>
                    <Button
                        variant="bordered"
                        className={styles.exportAction}
                        onClick={continueWithGoogle}
                    >
                        Continue with Google
                    </Button>
                </>
            )}
        </>
    );
};
