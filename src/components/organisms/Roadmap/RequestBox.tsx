import styles from './Roadmap.module.scss';

import Button from '@/components/atoms/Button/Button';

// "Have a request?" — the dark bar over the upcoming items. Placeholder
// destination: no request form on the DFO side yet.
const RequestBox = () => (
    <div className={styles.request}>
        <div>
            <h2 className={styles.requestTitle}>Have a request?</h2>
            <p className={styles.requestLead}>
                Tell us what data you need. Requests are reviewed by the DFO data team and inform
                the roadmap.
            </p>
        </div>
        <Button
            icon="arrow-up-right"
            onClick={() => {
                window.location.href = 'mailto:data@one.org?subject=DFO%20data%20request';
            }}
        >
            Submit Request
        </Button>
    </div>
);

export default RequestBox;
