import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import Studio from '@/components/organisms/Studio/Studio';
import { getSession } from '@/lib/auth/session';
import { pickExamples } from '@/lib/studio/examples';
import { pageVariant, promptEnabled, VARIANT_COOKIE } from '@/lib/studio/variant';

export const metadata: Metadata = {
    title: 'DFO Studio',
    robots: { index: false, follow: false },
};

// Open to everyone; a guest gets a few free prompts and no history. The
// session read makes this a per-request render, so each visit draws its own
// examples.
const StudioPage = async () => {
    const session = await getSession();
    const variant = pageVariant(
        (await cookies()).get(VARIANT_COOKIE)?.value,
        promptEnabled(process.env.STUDIO_PROMPT_ENABLED),
    );

    return <Studio guest={!session} examples={pickExamples()} variant={variant} />;
};

export default StudioPage;
