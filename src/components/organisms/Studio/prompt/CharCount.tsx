import classNames from 'classnames';

import styles from './PromptForm.module.scss';

import { INTERRUPT_TEXT_MAX, type InterruptTextCount } from '@/lib/studio/interruptText';

const LIMIT = INTERRUPT_TEXT_MAX.toLocaleString('en-GB');

/**
 * The count against the harness's limit on an amendment or a free-text
 * answer, shown near the limit and past it. The field points at it with
 * `aria-describedby={id}`. A separate live region says only when the text
 * crosses into "near" or "over", so a screen reader is not read the count on
 * every keystroke.
 */
const CharCount = ({ id, text }: { id: string; text: InterruptTextCount }) => (
    <>
        <p id={id} className={classNames(styles.charCount, text.over && styles.charCountOver)}>
            {text.show &&
                (text.over
                    ? `${(text.count - INTERRUPT_TEXT_MAX).toLocaleString('en-GB')} over the ${LIMIT} character limit`
                    : `${text.count.toLocaleString('en-GB')} of ${LIMIT} characters`)}
        </p>
        <p className={styles.srOnly} role="status">
            {text.over
                ? `Over the ${LIMIT} character limit`
                : text.show
                  ? `Close to the ${LIMIT} character limit`
                  : ''}
        </p>
    </>
);

export default CharCount;
