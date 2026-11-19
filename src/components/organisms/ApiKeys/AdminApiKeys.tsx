import Link from 'next/link';

import styles from './AdminApiKeys.module.scss';
import AdminSearch from './AdminSearch';
import { ADMIN_PAGE_SIZE, type AdminActions, type AdminUserView } from './AdminState';
import AdminUserRow from './AdminUserRow';

import PageFade from '@/components/molecules/PageFade/PageFade';
import PageHero from '@/components/molecules/PageHero/PageHero';

type AdminApiKeysProps = {
    // The page's users, already cut to the page.
    users: AdminUserView[];
    // Every user, and those the search matched.
    total: number;
    matched: number;
    query: string;
    page: number;
    // The per-minute limit an account without its own is held to.
    defaultLimit: number;
    keysEnabled: boolean;
    actions: AdminActions;
};

const count = (value: number) => value.toLocaleString('en-GB');

/** The link to a page of the list, keeping the search. */
const pageHref = (query: string, page: number): string => {
    const params = new URLSearchParams();

    if (query) {
        params.set('q', query);
    }

    if (page > 1) {
        params.set('page', String(page));
    }

    const text = params.toString();

    return text ? `?${text}` : '?';
};

/**
 * The operators' view of accounts (/admin/api-keys): the dark hero with the
 * user count and the email search, then one row per account that opens to its
 * MCP keys. The admin gate (lib/apiKeys/server `requireAdmin`) is what keeps
 * it private.
 */
const AdminApiKeys = ({
    users,
    total,
    matched,
    query,
    page,
    defaultLimit,
    keysEnabled,
    actions,
}: AdminApiKeysProps) => {
    const pages = Math.max(1, Math.ceil(matched / ADMIN_PAGE_SIZE));
    const first = (page - 1) * ADMIN_PAGE_SIZE + 1;

    return (
        <main>
            <section className={styles.page}>
                <PageHero tone="dark" className={styles.hero}>
                    <h1 className={styles.title}>
                        User Management
                        <span className={styles.count} aria-label={`${count(total)} users`}>
                            {count(total)}
                        </span>
                    </h1>
                    <p className={styles.lead}>Manage all user API keys</p>
                    <AdminSearch defaultValue={query} />
                </PageHero>

                <div className={styles.body}>
                    {!keysEnabled && (
                        <p className={styles.notice} role="status">
                            API_KEYS_ENABLED is off in this deployment: keys are ignored and every
                            call is counted by address.
                        </p>
                    )}
                    {query && (
                        <p className={styles.summary} role="status">
                            {count(matched)} of {count(total)} users
                        </p>
                    )}

                    {users.length === 0 ? (
                        <p className={styles.empty}>
                            {query ? 'No users match that search.' : 'No users on this page.'}
                        </p>
                    ) : (
                        <div className={styles.scroll}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th scope="col">User</th>
                                        <th scope="col">Created</th>
                                        <th scope="col">API Keys</th>
                                        <th scope="col">
                                            <span className={styles.visuallyHidden}>Keys</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((user) => (
                                        <AdminUserRow
                                            key={user.id}
                                            user={user}
                                            defaultLimit={defaultLimit}
                                            actions={actions}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {pages > 1 && (
                        <nav className={styles.pager} aria-label="Pages">
                            {page > 1 ? (
                                <Link
                                    className={styles.pageLink}
                                    href={pageHref(query, page - 1)}
                                    prefetch={false}
                                >
                                    Previous
                                </Link>
                            ) : (
                                <span />
                            )}
                            <span className={styles.pageInfo}>
                                {count(first)} to {count(Math.min(page * ADMIN_PAGE_SIZE, matched))}{' '}
                                of {count(matched)}
                            </span>
                            {page < pages ? (
                                <Link
                                    className={styles.pageLink}
                                    href={pageHref(query, page + 1)}
                                    prefetch={false}
                                >
                                    Next
                                </Link>
                            ) : (
                                <span />
                            )}
                        </nav>
                    )}
                </div>
                <PageFade height={120} />
            </section>
        </main>
    );
};

export default AdminApiKeys;
