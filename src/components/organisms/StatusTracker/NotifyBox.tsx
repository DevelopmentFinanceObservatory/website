'use client';

import { useState } from 'react';

import styles from './StatusTracker.module.scss';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';

export const NOTIFY_ID = 'subscribe';
export const NOTIFY_INPUT_ID = 'subscribe-email';

// "Get notified about incidents" — the dark box with the email form. No
// subscription endpoint yet: the form only acknowledges locally.
const NotifyBox = () => {
    const [email, setEmail] = useState('');
    const [subscribed, setSubscribed] = useState(false);

    return (
        <form
            id={NOTIFY_ID}
            className={styles.notify}
            onSubmit={(event) => {
                event.preventDefault();

                if (email.trim()) {
                    setSubscribed(true);
                }
            }}
        >
            <div>
                <h2 className={styles.notifyTitle}>Get notified about incidents</h2>
                <p className={styles.notifyLead}>
                    We’ll email you when a service is affected or when an incident is resolved.
                </p>
            </div>
            {subscribed ? (
                <p className={styles.notifyDone}>
                    <Icon name="check" />
                    You’re on the list.
                </p>
            ) : (
                <div className={styles.notifyForm}>
                    <input
                        id={NOTIFY_INPUT_ID}
                        type="email"
                        required
                        className={styles.emailInput}
                        placeholder="Enter Email Address"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                    />
                    <Button icon="arrow-up-right" type="submit" aria-label="Subscribe" />
                </div>
            )}
        </form>
    );
};

export default NotifyBox;
