import classNames from 'classnames';

import styles from './PromptForm.module.scss';

import { INTERRUPT_TEXT_MAX, type InterruptTextCount } from '@/lib/studio/interruptText';

/**
 * The count against the harness's limit on an amendment or a free-text
 * answer, shown near the limit and past it. A polite live region, so a
 * screen reader hears the count as the limit nears.
 */
const CharCount = ({ text }: { text: InterruptTextCount }) => (
    <p className={classNames(styles.charCount, text.over && styles.charCountOver)} role="status">
        {text.show &&
            (text.over
                ? `${(text.count - INTERRUPT_TEXT_MAX).toLocaleString('en-GB')} over the ${INTERRUPT_TEXT_MAX.toLocaleString('en-GB')} character limit`
                : `${text.count.toLocaleString('en-GB')} of ${INTERRUPT_TEXT_MAX.toLocaleString('en-GB')} characters`)}
    </p>
);

export default CharCount;
