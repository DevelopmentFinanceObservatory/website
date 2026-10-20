import type { Metadata } from 'next';

import Policy from '@/components/organisms/Policy/Policy';

export const metadata: Metadata = {
    title: 'AI Transparency — DFO',
    description:
        'How the DFO’s AI-assisted search works, where its figures come from, and what happens to what you type.',
};

const AiPolicyPage = () => (
    <main>
        <Policy title="AI Transparency">
            <h2>1. How the DFO AI works</h2>
            <p>
                The Development Finance Observatory features an AI-assisted search workflow that
                helps you navigate, filter, and synthesize development finance data. The AI agent is
                designed to answer only from a focused set of pre-vetted, official data sources —
                including OECD DAC, World Bank IDS, and IMF databases — and does not draw on the
                open web or general knowledge to generate figures.
            </p>
            <p>
                If a question falls outside this whitelisted set of sources, the assistant will tell
                you so rather than provide an answer. It is not able to guarantee the complete
                elimination of errors, and we encourage users to verify any figure used for
                high-stakes decisions against the cited primary source.
            </p>
            <p>
                The same data is available to other AI assistants, such as Claude and ChatGPT,
                through the DFO’s connector. There the DFO supplies the figures and their sources,
                and the assistant you chose writes the answer under its provider’s own terms.
            </p>

            <h2>2. Data provenance and source grounding</h2>
            <p>
                We prioritize precision over automation. Every figure the assistant returns is
                paired with a citation back to the primary source institution (e.g., OECD, World
                Bank, IMF) and, where applicable, the specific dataset and reporting year. The
                assistant is restricted from generating a standalone answer when no matching source
                can be retrieved — in that case, it will say the data isn’t available rather than
                estimate or infer a figure.
            </p>
            <p>
                If you believe the DFO produced an inaccurate or unsourced answer, report it to{' '}
                <a href="mailto:data@one.org">data@one.org</a>.
            </p>

            <h2>3. Data privacy commitments</h2>
            <p>Your privacy is a core part of how this platform is built:</p>
            <ul>
                <li>
                    <strong>No file collection.</strong> The DFO does not accept or process external
                    file uploads from users, so no external proprietary data or files enter the
                    system pipeline.
                </li>
                <li>
                    <strong>How questions are processed.</strong> The text of your question is sent
                    to Google’s Gemini models, which read it to find the data you asked for and, in
                    the Studio, to write the answer.
                </li>
                <li>
                    <strong>What a search records.</strong> When you search on this site, we record
                    the first 500 characters of your question together with the data it matched, to
                    learn what people look for and where the data falls short. The record is tied to
                    your account if you are signed in, and to a random identifier in your browser if
                    you accepted usage statistics in the cookie banner. These records are held in
                    the DFO’s own database and in PostHog, an analytics service hosted in the EU.
                </li>
                <li>
                    <strong>Studio conversations.</strong> The Studio stores each conversation so
                    that it can continue from one message to the next. If you are signed in, the
                    conversation is also saved to your account until you delete it or delete your
                    account. A technical record of each conversation, including its text, is kept in
                    Langfuse, a monitoring service hosted in the EU, so that we can find and fix
                    faults. Usage statistics record that a prompt was sent and how long it was, and
                    leave out its text.
                </li>
                <li>
                    <strong>Connected assistants.</strong> When you use the DFO from another
                    assistant, the DFO receives the question and the data requests that assistant
                    sends. It needs no account and is not told who you are. Charts and tables the
                    assistant creates through the DFO are stored so that they can be shown, and
                    anyone who has a chart’s link can open it.
                </li>
                <li>
                    <strong>Internet addresses.</strong> Our servers’ request logs record the
                    internet address of each request, as on any website. Usage statistics leave
                    it out. They record the country your request came from, and your browser’s
                    name and version, to tell people from automated traffic.
                </li>
            </ul>
            <p>
                For a question about your data, or for help with the DFO, write to{' '}
                <a href="mailto:data@one.org">data@one.org</a>. ONE’s{' '}
                <a
                    href="https://www.one.org/info/privacy-policy/"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    privacy policy
                </a>{' '}
                covers the rest of this website.
            </p>
        </Policy>
    </main>
);

export default AiPolicyPage;
