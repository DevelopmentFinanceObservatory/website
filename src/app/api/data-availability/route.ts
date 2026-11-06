import { loadDataAvailability } from '@/lib/studio/dataAvailabilityLoader';

// The Studio landing's "What data is available?" overview, read when the
// drawer opens so the landing itself waits for nothing. Both reads behind it
// are cached on the server, and a failed one leaves its half null, so this
// always answers 200.
export const GET = async () => Response.json(await loadDataAvailability());
