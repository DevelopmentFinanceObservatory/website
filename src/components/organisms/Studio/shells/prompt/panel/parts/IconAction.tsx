import classNames from 'classnames';
import { type ButtonHTMLAttributes, useEffect, useRef, useState } from 'react';

import { usePromptShell } from '../../shellContext';
import styles from './parts.module.scss';

import Icon, { type IconProps } from '@/components/atoms/Icon/Icon';

/** How long a done state (the tick, `Copied`) shows, in ms. */
export const CONFIRM_MS = 1600;

type IconActionProps = {
    icon: IconProps['name'];
    /** What the action does, such as `Download data`. */
    label: string;
    /** What it acts on, such as the card's title; joins the accessible name. */
    subject?: string;
    /** Runs the action. A result of `false`, or a rejection, shows no done
     *  state. */
    onAction: () => unknown;
    /** The words of the done state, such as `Data downloaded`. Without them
     *  the action shows none. */
    doneLabel?: string;
    /** The wide form shows the label beside the icon. */
    wide?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'>;

/**
 * A 24 px icon button. After the action succeeds it shows a check and its
 * done words for CONFIRM_MS, and announces them.
 */
export const IconAction = ({
    icon,
    label,
    subject,
    onAction,
    doneLabel,
    wide = false,
    className,
    ...rest
}: IconActionProps) => {
    const { announce } = usePromptShell();
    const [done, setDone] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    const run = async () => {
        let result: unknown;

        try {
            result = await onAction();
        } catch (error) {
            console.error(error);

            return;
        }

        if (result === false || !doneLabel) return;

        setDone(true);
        announce(doneLabel);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), CONFIRM_MS);
    };

    const words = done && doneLabel ? doneLabel : label;

    return (
        <button
            type="button"
            {...rest}
            className={classNames(styles.act, wide && styles.actWide, className)}
            aria-label={subject ? `${words}: ${subject}` : words}
            title={wide ? undefined : words}
            data-done={done || undefined}
            onClick={() => void run()}
        >
            <Icon name={done ? 'check' : icon} />
            {wide && <span>{label}</span>}
        </button>
    );
};
