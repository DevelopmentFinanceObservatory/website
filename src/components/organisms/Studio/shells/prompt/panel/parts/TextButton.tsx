import classNames from 'classnames';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';

import styles from './parts.module.scss';

/** A small underlined action in DM Mono. */
export const TextButton = ({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props} className={classNames(styles.textButton, className)} />
);

/** A TextButton that is a link. */
export const TextLink = ({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} className={classNames(styles.textButton, className)} />
);
