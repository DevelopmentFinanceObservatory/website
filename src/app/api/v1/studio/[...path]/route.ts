import { getUser } from '@/lib/auth/session';
import { claimConversationOwner, conversationOwners } from '@/lib/chat/conversationStore';
import { studioProxy } from '@/lib/studio/studioProxy';

// The studio-v1 harness (`/api/studio/*` on dfo-ai), mirrored under the
// site's domain by src/lib/studio/studioProxy.
const proxy = studioProxy({
    getUser,
    ownersOf: conversationOwners,
    claimOwner: claimConversationOwner,
});

export const GET = proxy;
export const POST = proxy;
export const OPTIONS = proxy;
