import styles from './ApiKeys.module.scss';
import ApiKeysShell from './ApiKeysShell';
import CreateKeyForm from './CreateKeyForm';
import DeleteKeyButton from './DeleteKeyButton';
import { formatDate } from './format';
import type { CreatedState, DeleteState } from './state';

import type { AdminKey } from '@/lib/apiKeys/service';

type AdminApiKeysProps = {
    keys: AdminKey[];
    // The email filter as typed, to fill the box again.
    filter: string;
    defaultLimit: number;
    keysEnabled: boolean;
    // The notice a limit change left, from the page's query (?limit=...).
    notice?: string;
    createAction: (previous: CreatedState, formData: FormData) => Promise<CreatedState>;
    deleteAction: (previous: DeleteState, formData: FormData) => Promise<DeleteState>;
    limitAction: (formData: FormData) => Promise<void>;
};

/**
 * The operators' view of every key (/admin/api-keys). A proof of concept:
 * plain on purpose, and the admin gate (lib/apiKeys/server `requireAdmin`)
 * is what keeps it private.
 */
const AdminApiKeys = ({
    keys,
    filter,
    defaultLimit,
    keysEnabled,
    notice,
    createAction,
    deleteAction,
    limitAction,
}: AdminApiKeysProps) => (
    <ApiKeysShell
        wide
        title="API keys: admin"
        lead="Every key across accounts. Proof of concept: it covers what operators need first, and will change."
    >
        <p className={keysEnabled ? styles.status : styles.notice} role="status">
            API_KEYS_ENABLED is <strong>{keysEnabled ? 'on' : 'off'}</strong>
            {keysEnabled
                ? ': keys are honoured.'
                : ': keys are stripped and every call is counted by address.'}{' '}
            It is set in the deployment, not here.
        </p>
        {notice && (
            <p className={styles.status} role="status">
                {notice}
            </p>
        )}

        <h2 className={styles.heading}>Keys</h2>
        <form className={styles.form} method="get">
            <label className={styles.field}>
                <span className={styles.label}>Filter by email</span>
                <input
                    className={styles.input}
                    type="search"
                    name="email"
                    defaultValue={filter}
                    placeholder="part of an email"
                />
            </label>
            <button type="submit" className={styles.secondary}>
                Filter
            </button>
        </form>
        {keys.length === 0 ? (
            <p className={styles.note}>{filter ? 'No keys match.' : 'No keys yet.'}</p>
        ) : (
            <div className={styles.scroll}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Key id</th>
                            <th>Label</th>
                            <th>Start</th>
                            <th>Owner</th>
                            <th>Created</th>
                            <th>Last request</th>
                            <th>Account limit</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {keys.map((key) => (
                            <tr key={key.id}>
                                <td>
                                    <code>{key.id}</code>
                                </td>
                                <td>{key.name || 'Unnamed'}</td>
                                <td>
                                    <code>{key.start ? `${key.start}…` : '—'}</code>
                                </td>
                                <td>{key.ownerEmail}</td>
                                <td>{formatDate(key.createdAt)}</td>
                                <td>
                                    {key.lastRequest ? formatDate(key.lastRequest) : 'Not recorded'}
                                </td>
                                <td>
                                    {key.accountLimit === null
                                        ? `default (${defaultLimit.toLocaleString('en-GB')})`
                                        : key.accountLimit.toLocaleString('en-GB')}
                                </td>
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
            </div>
        )}

        <h2 className={styles.heading}>Create a key for an account</h2>
        <CreateKeyForm action={createAction} withEmail />

        <h2 className={styles.heading}>Set an account&apos;s limit</h2>
        <form className={styles.form} action={limitAction}>
            <label className={styles.field}>
                <span className={styles.label}>Account email</span>
                <input
                    className={styles.input}
                    type="email"
                    name="email"
                    required
                    autoComplete="off"
                    placeholder="name@example.org"
                />
            </label>
            <label className={styles.field}>
                <span className={styles.label}>Calls per window</span>
                <input
                    className={styles.input}
                    type="text"
                    name="limit"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={`empty = default (${defaultLimit})`}
                />
            </label>
            <button type="submit" className={styles.primary}>
                Save limit
            </button>
        </form>
        <p className={styles.note}>
            A positive whole number, or empty to go back to the default. A change reaches the proxy
            within about a minute.
        </p>
    </ApiKeysShell>
);

export default AdminApiKeys;
