'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { createKey, deleteKey, listKeys } from './accountApi';
import styles from './ApiKeysPanel.module.scss';
import KeyCard from './KeyCard';
import NewKeyForm from './NewKeyForm';
import RevealedKey from './RevealedKey';
import type { ApiKeysData, KeyIssued } from './state';

import Button from '@/components/atoms/Button/Button';
import Modal from '@/components/molecules/Modal/Modal';
import { docsHref } from '@/lib/docs/href';

type ApiKeysPanelProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

// The panel's data, or the message to show in its place.
const fetchKeys = async (): Promise<ApiKeysData | string> => {
    const result = await listKeys();

    return 'error' in result ? result.error : result;
};

type View = { name: 'list' } | { name: 'create' } | { name: 'reveal'; key: string };

/**
 * The account's MCP keys in the house side panel, opened from the account
 * menu: list, create and delete, and the one-time view of a new key.
 * It reads and writes through the JSON routes under /api/account/api-keys, so it
 * works on any page, the prototypes app's static export included.
 */
const ApiKeysPanel = ({ open, onOpenChange }: ApiKeysPanelProps) => {
    const [data, setData] = useState<ApiKeysData | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [view, setView] = useState<View>({ name: 'list' });
    // The id of the key a delete is working on.
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const show = useCallback((result: ApiKeysData | string) => {
        if (typeof result === 'string') {
            setLoadError(result);
        } else {
            setLoadError(null);
            setData(result);
        }
    }, []);

    const load = useCallback(async () => show(await fetchKeys()), [show]);

    useEffect(() => {
        if (!open) {
            return;
        }

        let current = true;

        void fetchKeys().then((result) => {
            if (current) {
                show(result);
            }
        });

        return () => {
            current = false;
        };
    }, [open, show]);

    const handleOpenChange = (next: boolean) => {
        if (!next) {
            // A revealed key leaves memory with the panel.
            setView({ name: 'list' });
            setError(null);
        }

        onOpenChange(next);
    };

    const issued = async (result: KeyIssued) => {
        if ('error' in result) {
            return result.error;
        }

        setView({ name: 'reveal', key: result.key });
        await load();

        return null;
    };

    const remove = async (keyId: string) => {
        setBusyId(keyId);
        setError(null);

        const result = await deleteKey(keyId);

        setError(result.error);
        await load();
        setBusyId(null);
    };

    const create = async (label: string): Promise<string | null> => issued(await createKey(label));

    const atCap = !!data && data.keys.length >= data.maxKeys;

    return (
        <Modal open={open} onOpenChange={handleOpenChange} title="API keys" fit>
            {view.name === 'reveal' ? (
                <RevealedKey secret={view.key} onClose={() => setView({ name: 'list' })} />
            ) : view.name === 'create' ? (
                <NewKeyForm onCancel={() => setView({ name: 'list' })} onCreate={create} />
            ) : loadError ? (
                <p className={styles.error} role="alert">
                    {loadError}
                </p>
            ) : !data ? (
                <p className={styles.muted} role="status">
                    Loading…
                </p>
            ) : (
                <div className={styles.list}>
                    <div className={styles.who}>
                        {data.user.name && <span className={styles.name}>{data.user.name}</span>}
                        <span className={styles.muted}>{data.user.email}</span>
                    </div>

                    <div className={styles.sectionHead}>
                        <h3 className={styles.section}>MCP keys</h3>
                        <Button
                            small
                            variant="dark"
                            disabled={atCap}
                            onClick={() => {
                                setError(null);
                                setView({ name: 'create' });
                            }}
                        >
                            Create API key
                        </Button>
                    </div>

                    {!data.keysEnabled && (
                        <p className={styles.notice} role="status">
                            MCP keys are switched off for now. Calls count by address, and a key is
                            ignored.
                        </p>
                    )}
                    {atCap && (
                        <p className={styles.muted}>
                            You have {data.maxKeys} keys, the most an account may hold. Delete one
                            to make another.
                        </p>
                    )}
                    {error && (
                        <p className={styles.error} role="alert">
                            {error}
                        </p>
                    )}

                    {data.keys.length === 0 ? (
                        <p className={styles.muted}>
                            An MCP key raises your daily call limit on the DFO MCP server. See{' '}
                            <Link className={styles.link} href={docsHref('mcp/connect')}>
                                how to connect an assistant
                            </Link>
                            .
                        </p>
                    ) : (
                        data.keys.map((key) => (
                            <KeyCard
                                key={key.id}
                                item={key}
                                busy={busyId === key.id}
                                onDelete={() => remove(key.id)}
                            />
                        ))
                    )}
                </div>
            )}
        </Modal>
    );
};

export default ApiKeysPanel;
