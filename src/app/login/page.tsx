import type { Metadata } from 'next';

import AuthPage, { AuthPageProps } from '@/components/organisms/LoginScreen/AuthPage';

export const metadata: Metadata = {
    title: 'Sign in — DFO Studio',
    robots: { index: false, follow: false },
};

// The one sign-in screen (see AuthPage); /register only redirects here.
const LoginPage = (props: AuthPageProps) => <AuthPage {...props} />;

export default LoginPage;
