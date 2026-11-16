import styles from './BuiltWithMark.module.scss';

import Logo from '@/assets/svg/logo.svg';

/** "Built with" and the DFO logo, the mark at the right of a card's source bar. */
const BuiltWithMark = () => (
    <span className={styles.builtWith}>
        Built with
        <Logo />
    </span>
);

export default BuiltWithMark;
