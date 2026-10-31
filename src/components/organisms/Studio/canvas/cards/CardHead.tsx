import CardActions from './CardActions';
import styles from './Card.module.scss';
import type { CardExtras } from './types';

// Every card's first row: the title left, pin + kebab right. The row is a
// drag handle for the whiteboard (cardPress.ts).
const CardHead = (extras: CardExtras) => (
    <header className={styles.cardHead} data-drag-handle="">
        <p className={styles.cardTitle}>{extras.title}</p>
        <CardActions {...extras} />
    </header>
);

export default CardHead;
