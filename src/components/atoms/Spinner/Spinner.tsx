import classNames from 'classnames';

import styles from './Spinner.module.scss';

/**
 * The house loading indicator: a thin ring in currentColor, spinning. Size
 * via `size` (px, default 20) — drop it wherever something is being fetched.
 */
type SpinnerProps = {
    size?: number;
    className?: string;
    label?: string;
};

const Spinner = ({ size = 20, className, label = 'Loading' }: SpinnerProps) => (
    <span
        className={classNames(styles.spinner, className)}
        style={{ width: size, height: size }}
        role="status"
        aria-label={label}
    />
);

export default Spinner;
