import {
    SPEC_SHAPE,
    storedDownload,
    VERSION_SHAPE,
    type VersionLinkDocument,
} from '@/lib/search/versionLink';
import { searchApiBase } from '@/lib/searchApi';

// GET /api/version-download/<spec>/<cv> → 302 to the version's stored file.
// The manifest signs its file URLs for minutes, so a page that links to
// one goes dead; this route reads the manifest at click time and redirects
// to a fresh URL for the file `storedDownload` picks. 404 when the API
// serves no such version or the version lists no file to offer.
export const GET = async (
    _req: Request,
    { params }: { params: Promise<{ spec: string; cv: string }> },
) => {
    const { spec, cv } = await params;

    if (!SPEC_SHAPE.test(spec) || !VERSION_SHAPE.test(cv)) {
        return Response.json({ detail: 'Bad ref' }, { status: 400 });
    }

    const res = await fetch(`${searchApiBase()}/api/datasets/${spec}/${cv}`, {
        cache: 'no-store',
    }).catch(() => null);

    if (res?.status === 404 || res?.status === 410) {
        return Response.json({ detail: 'No such version' }, { status: 404 });
    }

    if (!res?.ok) {
        console.error('version-download: the manifest read failed', {
            spec,
            cv,
            status: res?.status ?? 'unreachable',
        });

        return Response.json({ detail: 'The version could not be read' }, { status: 502 });
    }

    const file = storedDownload((await res.json()) as VersionLinkDocument);

    if (!file) {
        return Response.json({ detail: 'No stored file for this version' }, { status: 404 });
    }

    return new Response(null, {
        status: 302,
        headers: { Location: file.url, 'Cache-Control': 'no-store' },
    });
};
