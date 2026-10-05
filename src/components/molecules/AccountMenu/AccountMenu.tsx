'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import classNames from 'classnames';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import styles from './AccountMenu.module.scss';
import DeleteAccountModal from './DeleteAccountModal';

import Button from '@/components/atoms/Button/Button';
import { signOut, useSession } from '@/lib/auth/client';

/**
 * The header's account button. Signed out it leads to /login (and back
 * here afterwards); signed in it opens the account menu — who you are, My
 * History, delete account (confirmed in the house panel), sign out.
 */
type AccountMenuProps = {
    className?: string;
};

const AccountMenu = ({ className }: AccountMenuProps) => {
    const { data: session, isPending } = useSession();
    const router = useRouter();
    const pathname = usePathname();
    const [deleteOpen, setDeleteOpen] = useState(false);
    // Keys the modal per opening so its fields start clean; it stays
    // mounted through the close animation.
    const [deleteSeq, setDeleteSeq] = useState(0);

    if (!session) {
        return (
            <Button
                className={className}
                icon="user"
                aria-label={isPending ? 'Account' : 'Sign in'}
                onClick={() => router.push(`/login?next=${encodeURIComponent(pathname)}`)}
            />
        );
    }

    const { user } = session;

    const leave = async () => {
        await signOut();
        // Studio is account-only — leaving it signed out goes home; elsewhere
        // just refresh the header state.
        if (pathname.startsWith('/studio')) {
            router.push('/');
        } else {
            router.refresh();
        }
    };

    return (
        // Non-modal, like every other menu in the app: the modal variant locks
        // the page (body pointer-events off + scroll lock) and on touch the
        // menu never showed, leaving the lock behind.
        <DropdownMenu.Root modal={false}>
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
                    <DropdownMenu.Item asChild onSelect={() => router.push('/history')}>
                        <button type="button" className={styles.item}>
                            My History
                        </button>
                    </DropdownMenu.Item>
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
