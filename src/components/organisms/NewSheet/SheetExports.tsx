'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import styles from './NewSheet.module.scss';

import Button from '@/components/atoms/Button/Button';
import { downloadCsv } from '@/components/organisms/GraphExplorer/downloadCsv';
import { authClient } from '@/lib/auth/client';
import {
    DRIVE_FILE_SCOPE,
    type SheetRequest,
    type SheetsAnswer,
} from '@/lib/graphExplorer/googleSheet';
import type { SheetColumn } from '@/lib/graphExplorer/sheet';

/** The sheet the page shows, as each export receives it. */
export type SheetDraft = {
    /** The label of the kind of thing the figures are about. */
    readonly title: string;
    /** The graph generation the model was read from, or null when it has none. */
    readonly generation: string | null;
    /** The CSV file name built from the title. */
    readonly fileName: string;
    /** The columns in order, each property column with its value list's members as `lookup`. */
    readonly columns: readonly SheetColumn[];
    /** The example rows under the header, one value per column. */
    readonly rows: readonly (readonly string[])[];
};

export type SheetExportProps = { sheet: SheetDraft };

/** Downloads the header row and the example rows as a CSV file. */
const DownloadCsv = ({ sheet }: SheetExportProps) => (
    <Button
        onClick={() =>
            downloadCsv([sheet.columns.map((column) => column.name), ...sheet.rows], sheet.fileName)
        }
    >
        Download CSV
    </Button>
);

/** Where the Google sheet handler answers. */
const SHEETS_ROUTE = '/graph-explorer/api/sheets';

/** The parameter Better Auth adds to the return address when Google access was not granted. */
const LINK_ERROR_PARAM = 'error';

const sheetRequest = (sheet: SheetDraft): SheetRequest => ({
    title: sheet.title,
    generation: sheet.generation,
    columns: sheet.columns.map((column) => ({
        name: column.name,
        kind: column.kind,
        lookup: column.lookup && {
            valueList: column.lookup.valueList,
            members: column.lookup.members.map(({ id, label, code }) => ({ id, label, code })),
        },
    })),
    rows: sheet.rows.map((row) => [...row]),
});

type CreateState =
    | { kind: 'idle' }
    | { kind: 'working' }
    | { kind: 'created'; url: string; dropdownsFailed: boolean }
    | { kind: 'needs_google' }
    | { kind: 'failed'; message: string };

/** What the reader is told for each refusal the handler can answer. */
const failureMessage = (status: number, answer: SheetsAnswer | null): string => {
    if (status === 401) return 'You are signed out. Sign in again, then create the sheet.';
    if (status === 403) return 'Your account does not have access to the Graph Explorer.';
    if (status === 400)
        return 'This sheet is too large to create in Google Sheets. Download the CSV instead.';
    if (status === 502) return 'Google could not create the sheet. Try again in a minute.';
    return answer && !answer.ok ? answer.message : 'The sheet could not be created. Try again.';
};

/**
 * Sends Google's consent screen for the `drive.file` scope, then returns to
 * this page with its query, so the sheet the reader built is still there.
 */
const continueWithGoogle = async () => {
    const back = new URL(window.location.href);
    back.searchParams.delete(LINK_ERROR_PARAM);
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
 * explains why and offers Google's consent screen on a click.
 */
const CreateGoogleSheet = ({ sheet }: SheetExportProps) => {
    const linkFailed = useSearchParams().has(LINK_ERROR_PARAM);
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
            } else if (response.status === 409) {
                setState({ kind: 'needs_google' });
            } else {
                setState({ kind: 'failed', message: failureMessage(response.status, answer) });
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
                    <p className={styles.exportStatus}>
                        To create the sheet, the tool needs permission to add files to your Google
                        Drive. It can see only the files it creates.
                    </p>
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

/**
 * The export buttons on the sheet's export row, in order. Each is a component
 * that receives the sheet; an export joins the row by joining this list.
 */
export const SHEET_EXPORTS: readonly React.ComponentType<SheetExportProps>[] = [
    CreateGoogleSheet,
    DownloadCsv,
];
