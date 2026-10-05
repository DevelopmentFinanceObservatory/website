import CardActions from './CardActions';
import styles from './Card.module.scss';
import type { CardExtras } from './types';

// Every card's first row: the title left, pin + kebab right.
const CardHead = (extras: CardExtras) => (
    <header className={styles.cardHead}>
        <p className={styles.cardTitle}>{extras.title}</p>
        <CardActions {...extras} />
    </header>
);

export default CardHead;
