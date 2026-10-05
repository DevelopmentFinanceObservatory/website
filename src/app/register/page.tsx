import { redirect } from 'next/navigation';

// There is no separate sign-up any more: an account is made by the first
// sign-in through a provider. Old links to /register keep working — they
// land on the sign-in page with their `next` intact.
const RegisterPage = async ({
    searchParams,
}: {
    searchParams: Promise<{ next?: string }>;
}) => {
    const { next } = await searchParams;

    redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
};

export default RegisterPage;
