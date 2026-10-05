'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

import styles from './MoreMenu.module.scss';

import Icon, { type IconProps } from '@/components/atoms/Icon/Icon';

export type MoreMenuItem = { label: string; icon: IconProps['name']; onSelect: () => void };

/**
 * The phone's overflow menu: the bar actions the small header can't hold
 * (New Chat, Customize, Share) plus Add Text Card, behind one ⋮ button —
 * the house popup, like the card menu.
 */
const MoreMenu = ({ items }: { items: MoreMenuItem[] }) => (
    <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
            <button type="button" className={styles.trigger} aria-label="More actions">
                <Icon name="kebab" className={styles.triggerIcon} />
            </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
            <DropdownMenu.Content
                className={styles.menu}
                side="bottom"
                align="end"
                sideOffset={6}
                collisionPadding={10}
                onCloseAutoFocus={(event) => event.preventDefault()}
            >
                {items.map((item) => (
                    <DropdownMenu.Item key={item.label} asChild onSelect={item.onSelect}>
                        <button type="button" className={styles.row}>
                            <Icon name={item.icon} className={styles.rowIcon} />
                            <span className={styles.rowLabel}>{item.label}</span>
                        </button>
                    </DropdownMenu.Item>
                ))}
            </DropdownMenu.Content>
        </DropdownMenu.Portal>
    </DropdownMenu.Root>
);

export default MoreMenu;
