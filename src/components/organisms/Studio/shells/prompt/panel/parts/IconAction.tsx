import classNames from 'classnames';
import type { ButtonHTMLAttributes } from 'react';

import styles from './parts.module.scss';
import { useConfirm } from './useConfirm';

import Icon, { type IconProps } from '@/components/atoms/Icon/Icon';

type IconActionProps = {
    icon: IconProps['name'];
    /** What the action does, such as `Download data`. */
    label: string;
    /** What it acts on, such as the card's title; joins the accessible name. */
    subject?: string;
    /** Runs the action. A result of `false`, or a rejection, is a failure. */
    onAction: () => unknown;
    /** The words of the done state, such as `Data downloaded`. Without them
     *  a success shows nothing. */
    doneLabel?: string;
    /** The words of the failed state; `<label> failed` without them. */
    failLabel?: string;
    /** The wide form shows the label beside the icon. */
    wide?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'>;

/**
 * A 24 px icon button. When the action ends it shows a check and its done
 * words, or a cross and its failure words, for CONFIRM_MS, and announces
 * them.
 */
export const IconAction = ({
    icon,
    label,
    subject,
    onAction,
    doneLabel,
    failLabel,
    wide = false,
    className,
    ...rest
}: IconActionProps) => {
    const { outcome, run } = useConfirm();
    const failed = failLabel ?? `${label} failed`;
    const words =
        outcome === 'failed' ? failed : outcome === 'done' && doneLabel ? doneLabel : label;

    return (
        <button
            type="button"
            {...rest}
            className={classNames(styles.act, wide && styles.actWide, className)}
            aria-label={subject ? `${words}: ${subject}` : words}
            title={wide ? undefined : words}
            data-done={outcome === 'done' || undefined}
            data-failed={outcome === 'failed' || undefined}
            onClick={() => void run(onAction, { done: doneLabel, failed })}
        >
            <Icon name={outcome === 'done' ? 'check' : outcome === 'failed' ? 'closer' : icon} />
            {wide && <span>{outcome === 'failed' ? failed : label}</span>}
        </button>
    );
};
