'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import classNames from 'classnames';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import styles from './AccountMenu.module.scss';
import DeleteAccountModal from './DeleteAccountModal';

import Button from '@/components/atoms/Button/Button';
import { useSiteNavigate } from '@/hooks/useSiteNavigate';
import { viewerIsAdmin } from '@/lib/apiKeys/viewer';
import { signOut, useSession } from '@/lib/auth/client';
import { IS_SITE } from '@/lib/site';

/**
 * The header's account button. Signed out it leads to /login (and back
 * here afterwards); signed in it opens the account menu — who you are, My
 * History, API keys, Admin (admins only), delete account (confirmed in the
 * house panel), sign out.
 *
 * Whether the viewer is an admin is a server setting (ADMIN_EMAILS), so the
 * menu asks once, the first time it opens for a given user, and shows the
 * Admin item when the answer comes back. The prototypes app has no admin
 * page, so it never asks.
 */
type AccountMenuProps = {
    className?: string;
};

const AccountMenu = ({ className }: AccountMenuProps) => {
    const { data: session, isPending } = useSession();
    const router = useRouter();
    const navigate = useSiteNavigate();
    const pathname = usePathname();
    const [deleteOpen, setDeleteOpen] = useState(false);
    // Keys the modal per opening so its fields start clean; it stays
    // mounted through the close animation.
    const [deleteSeq, setDeleteSeq] = useState(0);
    // The user id the admin answer belongs to, so another sign-in asks again.
    const [admin, setAdmin] = useState<{ userId: string; admin: boolean } | null>(null);

    if (!session) {
        return (
            <Button
                className={className}
                icon="user"
                aria-label={isPending ? 'Account' : 'Sign in'}
                onClick={() => {
                    // Back to this page after sign-in. In the prototypes app
                    // usePathname() drops the basePath, so read the address.
                    const here = IS_SITE ? pathname : window.location.pathname;

                    navigate(`/login?next=${encodeURIComponent(here)}`);
                }}
            />
        );
    }

    const { user } = session;
    const isAdmin = admin?.userId === user.id && admin.admin;

    const askAdmin = (open: boolean) => {
        if (!open || !IS_SITE || admin?.userId === user.id) {
            return;
        }
        const userId = user.id;

        viewerIsAdmin().then(
            (answer) => setAdmin({ userId, admin: answer }),
            () => setAdmin({ userId, admin: false }),
        );
    };

    const leave = async () => {
        await signOut();
        // Studio is account-only — leaving it signed out goes home; elsewhere
        // just refresh the header state.
        if (IS_SITE && pathname.startsWith('/studio')) {
            router.push('/');
        } else {
            router.refresh();
        }
    };

    return (
        // Non-modal, like every other menu in the app: the modal variant locks
        // the page (body pointer-events off + scroll lock) and on touch the
        // menu never showed, leaving the lock behind.
        <DropdownMenu.Root modal={false} onOpenChange={askAdmin}>
            <DropdownMenu.Trigger asChild>
                <Button className={className} icon="user" aria-label="Account" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    className={styles.content}
                    align="end"
                    sideOffset={8}
                    collisionPadding={10}
                    onCloseAutoFocus={(event) => event.preventDefault()}
                >
                    <div className={styles.who}>
                        {user.image ? (
                            // Google avatar — a plain img, it's a remote URL we don't optimise.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                className={styles.avatar}
                                src={user.image}
                                alt=""
                                referrerPolicy="no-referrer"
                            />
                        ) : (
                            <span className={styles.avatarFallback} aria-hidden>
                                {(user.name || user.email).charAt(0).toUpperCase()}
                            </span>
                        )}
                        <span className={styles.whoText}>
                            <span className={styles.name}>{user.name || 'Account'}</span>
                            <span className={styles.email}>{user.email}</span>
                        </span>
                    </div>
                    <DropdownMenu.Separator className={styles.separator} />
                    <DropdownMenu.Item asChild onSelect={() => navigate('/history')}>
                        <button type="button" className={styles.item}>
                            My History
                        </button>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item asChild onSelect={() => navigate('/account/api-keys')}>
                        <button type="button" className={styles.item}>
                            API keys
                        </button>
                    </DropdownMenu.Item>
                    {isAdmin && (
                        <DropdownMenu.Item asChild onSelect={() => navigate('/admin/api-keys')}>
                            <button type="button" className={styles.item}>
                                Admin: API keys
                            </button>
                        </DropdownMenu.Item>
                    )}
                    <DropdownMenu.Item asChild onSelect={leave}>
                        <button type="button" className={styles.item}>
                            Sign out
                        </button>
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className={styles.separator} />
                    <DropdownMenu.Item
                        asChild
                        onSelect={() => {
                            setDeleteSeq((n) => n + 1);
                            setDeleteOpen(true);
                        }}
                    >
                        <button
                            type="button"
                            className={classNames(styles.item, styles.itemDanger)}
                        >
                            Delete account
                        </button>
                    </DropdownMenu.Item>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
            <DeleteAccountModal
                key={`delete-${deleteSeq}`}
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
            />
        </DropdownMenu.Root>
    );
};

export default AccountMenu;
