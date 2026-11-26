import classNames from 'classnames';

import styles from './parts.module.scss';

import Icon from '@/components/atoms/Icon/Icon';

/**
 * A 12 px chevron. `down` points right while its button is shut and down
 * while its button has `aria-expanded="true"`; `right` and `left` point
 * that way.
 */
export const Chevron = ({ direction }: { direction: 'down' | 'right' | 'left' }) => (
    <span
        aria-hidden="true"
        className={classNames(
            styles.chev,
            direction === 'left' && styles.chevLeft,
            direction === 'right' && styles.chevRight,
            direction === 'down' && styles.chevDown,
        )}
    >
        <Icon name="chevron-down" />
    </span>
);
