import styles from './ApiKeys.module.scss';
import ApiKeysShell from './ApiKeysShell';
import CreateKeyForm from './CreateKeyForm';
import DeleteKeyButton from './DeleteKeyButton';
import { formatDate } from './format';
import type { CreatedState, DeleteState } from './state';

import type { OwnKey } from '@/lib/apiKeys/service';

type AccountApiKeysProps = {
    keys: OwnKey[];
    max: number;
    // The account's calls per window: its own limit, else the default.
    limit: number;
    ownLimit: boolean;
    windowSeconds: number;
    // False while the emergency switch (API_KEYS_ENABLED) is off.
    keysEnabled: boolean;
    createAction: (previous: CreatedState, formData: FormData) => Promise<CreatedState>;
    deleteAction: (previous: DeleteState, formData: FormData) => Promise<DeleteState>;
};

/** The account's API keys page (/account/api-keys): list, create, delete, and how to use a key. */
const AccountApiKeys = ({
    keys,
    max,
    limit,
    ownLimit,
    windowSeconds,
    keysEnabled,
    createAction,
    deleteAction,
}: AccountApiKeysProps) => (
    <ApiKeysShell
        title="API keys"
        lead="A key lets a program call the DFO's data and MCP APIs as your account, with a higher allowance than an anonymous caller."
    >
        {!keysEnabled && (
            <p className={styles.notice} role="status">
                API keys are switched off for now. Calls are counted by address, and a key is
                ignored.
            </p>
        )}

        <h2 className={styles.heading}>Your keys</h2>
        {keys.length === 0 ? (
            <p className={styles.note}>You have no keys yet.</p>
        ) : (
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Label</th>
                        <th>Key</th>
                        <th>Created</th>
                        <th>Last used</th>
                        <th />
                    </tr>
                </thead>
                <tbody>
                    {keys.map((key) => (
                        <tr key={key.id}>
                            <td>{key.name || 'Unnamed'}</td>
                            <td>
                                <code>{key.start ? `${key.start}…` : '—'}</code>
                            </td>
                            <td>{formatDate(key.createdAt)}</td>
                            <td>{key.lastRequest ? formatDate(key.lastRequest) : 'Not yet'}</td>
                            <td className={styles.actions}>
                                <DeleteKeyButton
                                    action={deleteAction}
                                    keyId={key.id}
                                    label={key.name || 'Unnamed'}
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
        <p className={styles.note}>
            A deleted key stops working within about a minute. “Last used” is approximate, up to a
            minute or so behind. You can hold {max} keys.
        </p>

        <h2 className={styles.heading}>Create a key</h2>
        <CreateKeyForm
            action={createAction}
            blocked={
                keys.length >= max
                    ? `You hold ${max} keys, the most an account may. Delete one to make another.`
                    : undefined
            }
        />

        <h2 className={styles.heading}>Your allowance</h2>
        <p className={styles.copy}>
            Calls made with any of your keys share one allowance:{' '}
            <strong>
                {limit.toLocaleString('en-GB')} calls every {windowSeconds} seconds
            </strong>
            , on the data API and on the MCP server each.{' '}
            {ownLimit
                ? 'This limit was set for your account.'
                : 'This is the standard limit for accounts.'}{' '}
            More keys do not add to it.
        </p>

        <h2 className={styles.heading}>Using a key</h2>
        <p className={styles.copy}>Send the key with each call, in either header:</p>
        <pre className={styles.code}>
            {`Authorization: Bearer <your key>\nX-API-Key: <your key>`}
        </pre>
        <p className={styles.copy}>For example:</p>
        <pre className={styles.code}>
            {`curl -fsS -H "Authorization: Bearer $DFO_API_KEY" \\\n  https://developmentfinance.org/api/v1/graph/capabilities`}
        </pre>
        <p className={styles.copy}>
            Keep a key secret, like a password. If one leaks, delete it here and make another. Never
            put one in a web page or a public repository.
        </p>
    </ApiKeysShell>
);

export default AccountApiKeys;
