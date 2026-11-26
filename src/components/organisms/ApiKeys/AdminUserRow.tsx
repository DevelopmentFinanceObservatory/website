'use client';

import classNames from 'classnames';
import { useId, useState } from 'react';

import styles from './AdminApiKeys.module.scss';
import { type AdminActions, type AdminUserView, formatDateTime, ROLE_LABELS } from './AdminState';
import AdminUserKeys from './AdminUserKeys';

import Icon from '@/components/atoms/Icon/Icon';

type AdminUserRowProps = {
    user: AdminUserView;
    // The per-minute limit an account without its own is held to.
    defaultLimit: number;
    // The daily quota an account without its own is held to.
    defaultDailyLimit: number;
    actions: AdminActions;
};

/**
 * One account in the table, as two rows: the account's own, and under it,
 * once opened, its keys. Each row opens on its own, and a user's keys load
 * the first time it opens.
 */
const AdminUserRow = ({ user, defaultLimit, defaultDailyLimit, actions }: AdminUserRowProps) => {
    const [open, setOpen] = useState(false);
    const panelId = useId();

    return (
        <>
            <tr className={classNames(styles.row, open && styles.rowOpen)}>
                <th scope="row" className={styles.email}>
                    {user.email}
                </th>
                <td className={styles.roleCell}>
                    {/* The role ADMIN_EMAILS gives the account, shown as a
                        label because the site stores no role to change. */}
                    <span className={styles.role}>{ROLE_LABELS[user.role]}</span>
                </td>
                <td className={classNames(styles.mono, styles.created)}>
                    <time dateTime={user.createdAt.toISOString()}>
                        {formatDateTime(user.createdAt)}
                    </time>
                </td>
                <td className={styles.active}>{user.activeKeys} Active</td>
                <td className={styles.toggleCell}>
                    <button
                        type="button"
                        className={classNames(styles.toggle, open && styles.toggleOpen)}
                        aria-expanded={open}
                        aria-controls={panelId}
                        aria-label={`${open ? 'Hide' : 'Show'} keys for ${user.email}`}
                        onClick={() => setOpen((value) => !value)}
                    >
                        <Icon name="chevron-down" />
                    </button>
                </td>
            </tr>
            {open && (
                <tr id={panelId} className={styles.detail}>
                    <td colSpan={5}>
                        <AdminUserKeys
                            user={user}
                            defaultLimit={defaultLimit}
                            defaultDailyLimit={defaultDailyLimit}
                            actions={actions}
                        />
                    </td>
                </tr>
            )}
        </>
    );
};

export default AdminUserRow;
