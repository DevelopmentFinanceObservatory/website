import type { Metadata } from 'next';

import Policy from '@/components/organisms/Policy/Policy';

export const metadata: Metadata = {
    title: 'AI Transparency — DFO',
    description:
        'How the DFO’s AI-assisted search works, where its figures come from, and what happens to what you type.',
};

// ONE's own text (legal's draft, "Website policy content - DFO"). Two
// bullets of section 3 — retention and legal basis — are still blanks in
// that draft, so they are not on the page yet: a policy page must not
// publish a placeholder.
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
                    <strong>Enterprise isolation.</strong> Natural language interactions are
                    processed through isolated enterprise-tier channels. Your query strings, search
                    history, and session parameters are confidential and are not used to train any
                    public AI model.
                </li>
                <li>
                    <strong>Data minimization.</strong> Query text is processed only to generate a
                    response and is not linked to a persistent user profile beyond what’s needed to
                    maintain your active session.
                </li>
            </ul>
        </Policy>
    </main>
);

export default AiPolicyPage;
