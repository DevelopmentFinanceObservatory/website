// OpenAI's domain-verification token for the app directory. It must be the
// exact token as plain text: no JSON, no list, no trailing newline. The
// value is trimmed, so a secret stored with a trailing newline is still
// served exactly. One that is empty after trimming answers 404 like an unset
// one.
// The variable is read per request so the deployed value wins over whatever
// the build saw; without `dynamic` Next would prerender this GET.
export const dynamic = 'force-dynamic';

export const GET = (): Response => {
    const token = process.env.OPENAI_APPS_CHALLENGE?.trim();

    if (!token) {
        return new Response(null, { status: 404 });
    }

    return new Response(token, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
