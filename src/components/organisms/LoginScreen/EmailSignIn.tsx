'use client';

import { useEffect, useRef, useState, type SubmitEvent } from 'react';

import styles from './LoginScreen.module.scss';

import Button from '@/components/atoms/Button/Button';
import Turnstile from '@/components/atoms/Turnstile/Turnstile';
import { emailOtp, signIn } from '@/lib/auth/client';

/**
 * Email sign-in on /login. The address and a Turnstile check send a
 * six-digit code (Better Auth's emailOTP, see lib/auth/auth), then the code
 * signs in. The first code sign-in for an address creates the account.
 */
type EmailSignInProps = {
    next: string;
    turnstileSiteKey: string;
    codeMinutes: number;
    // A provider redirect is under way.
    disabled: boolean;
    // Shown (its accordion open). Opening it from "Use email instead" moves
    // focus to the field. A page where email is the only way in does not.
    open: boolean;
    focusWhenOpened: boolean;
};

// What the server can refuse with (Better Auth's error `code`).
const ERRORS: Record<string, string> = {
    INVALID_EMAIL: 'Enter a valid email address.',
    THROWAWAY_EMAIL: 'That looks like a throwaway address. Please use a permanent one.',
    VERIFICATION_FAILED: 'The bot check did not pass. Please try again.',
    MISSING_RESPONSE: 'The bot check did not finish. Please try again.',
    INVALID_OTP: 'That code is not right. Check it and try again.',
    OTP_EXPIRED: 'That code has expired. Send a new one.',
    TOO_MANY_ATTEMPTS: 'Too many wrong tries for that code. Send a new one.',
    CODE_NOT_SENT: 'We could not send the code. Please try again in a few minutes.',
};

const describe = (error: { code?: string; message?: string; status: number }) => {
    // TOO_MANY_CODES carries the wait in its message.
    if (error.code === 'TOO_MANY_CODES' && error.message) {
        return error.message;
    }

    if (error.code && ERRORS[error.code]) {
        return ERRORS[error.code];
    }

    if (error.status === 429) {
        return 'Too many tries. Wait a minute and try again.';
    }

    return 'Something went wrong. Please try again.';
};

const EmailSignIn = ({
    next,
    turnstileSiteKey,
    codeMinutes,
    disabled,
    open,
    focusWhenOpened,
}: EmailSignInProps) => {
    const [step, setStep] = useState<'email' | 'code'>('email');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [token, setToken] = useState<string | null>(null);
    // Each Turnstile token is good for one send. A new key remounts the
    // widget for the next one.
    const [check, setCheck] = useState(0);
    const [checkDown, setCheckDown] = useState(false);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState<string | null>(null);
    const field = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open && focusWhenOpened) {
            field.current?.focus({ preventScroll: true });
        }
    }, [open, focusWhenOpened, step]);

    const sendCode = async (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!token) {
            return;
        }

        setBusy(true);
        setFailed(null);

        const { error } = await emailOtp.sendVerificationOtp({
            email: email.trim(),
            type: 'sign-in',
            fetchOptions: { headers: { 'x-captcha-response': token } },
        });

        setToken(null);
        setCheck((n) => n + 1);
        setBusy(false);

        if (error) {
            setFailed(describe(error));

            return;
        }

        setCode('');
        setStep('code');
    };

    const signInWithCode = async (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        setFailed(null);

        const { error } = await signIn.emailOtp({ email: email.trim(), otp: code.trim() });

        if (error) {
            setBusy(false);
            setFailed(describe(error));

            return;
        }

        // A full load, so every part of the page reads the new session.
        window.location.assign(next);
    };

    const startOver = () => {
        setFailed(null);
        setStep('email');
    };

    return (
        <div className={styles.emailPanel}>
            {step === 'email' ? (
                <form className={styles.emailForm} onSubmit={sendCode}>
                    <label className={styles.label} htmlFor="sign-in-email">
                        Email
                    </label>
                    <input
                        ref={field}
                        id="sign-in-email"
                        className={styles.input}
                        type="email"
                        autoComplete="email"
                        placeholder="you@organisation.org"
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        disabled={disabled || busy}
                    />
                    <Turnstile
                        key={check}
                        siteKey={turnstileSiteKey}
                        onToken={(fresh) => {
                            setToken(fresh);

                            if (fresh) {
                                setCheckDown(false);
                            }
                        }}
                        onUnavailable={() => setCheckDown(true)}
                    />
                    <Button
                        variant="bordered"
                        icon="arrow"
                        full
                        type="submit"
                        disabled={disabled || busy || !token || !email.trim()}
                    >
                        {busy ? 'Sending…' : token ? 'Email me a code' : 'Checking your browser…'}
                    </Button>
                </form>
            ) : (
                <form className={styles.emailForm} onSubmit={signInWithCode}>
                    <p className={styles.hint}>
                        We sent a code to <strong>{email.trim()}</strong>. It lasts {codeMinutes}{' '}
                        minutes.
                    </p>
                    <label className={styles.label} htmlFor="sign-in-code">
                        Code
                    </label>
                    <input
                        ref={field}
                        id="sign-in-code"
                        className={styles.input}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        value={code}
                        onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                        disabled={disabled || busy}
                    />
                    <Button
                        variant="bordered"
                        icon="arrow"
                        full
                        type="submit"
                        disabled={disabled || busy || code.length !== 6}
                    >
                        {busy ? 'One moment…' : 'Sign in'}
                    </Button>
                    <Button variant="plain" className={styles.startOver} onClick={startOver}>
                        Send a new code or use another address
                    </Button>
                </form>
            )}

            {checkDown && step === 'email' && (
                <p className={styles.error} role="alert">
                    The bot check could not run. Check your connection or content blocker, then
                    reload the page.
                </p>
            )}

            {failed && (
                <p className={styles.error} role="alert">
                    {failed}
                </p>
            )}
        </div>
    );
};

export default EmailSignIn;
