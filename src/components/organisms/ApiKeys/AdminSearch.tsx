'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import styles from './AdminApiKeys.module.scss';

import Button from '@/components/atoms/Button/Button';

// How long typing pauses before the list follows it.
const DEBOUNCE_MS = 300;

/**
 * The email search. A GET form, so it works without JavaScript; with it, the
 * list follows the typing after a short pause. Both routes set `?q=` and
 * drop `?page=`.
 */
const AdminSearch = ({ defaultValue }: { defaultValue: string }) => {
    const router = useRouter();
    const pathname = usePathname();
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    const follow = (value: string) => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            const query = value.trim();

            router.replace(query ? `${pathname}?q=${encodeURIComponent(query)}` : pathname);
        }, DEBOUNCE_MS);
    };

    return (
        <form className={styles.search} method="get" role="search">
            <label className={styles.searchField}>
                <span className={styles.visuallyHidden}>Search by email address</span>
                <input
                    className={styles.searchInput}
                    type="search"
                    name="q"
                    defaultValue={defaultValue}
                    maxLength={320}
                    autoComplete="off"
                    placeholder="Search by email address"
                    onChange={(event) => follow(event.target.value)}
                />
            </label>
            <Button type="submit" variant="light" icon="search">
                Search
            </Button>
        </form>
    );
};

export default AdminSearch;
