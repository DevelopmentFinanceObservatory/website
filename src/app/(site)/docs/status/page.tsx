import { notFound } from 'next/navigation';

/**
 * Hidden for launch.
 *
 * Everything the Status Tracker shows is placeholder copy from the designs
 * — there is no status endpoint on the DFO side, no uptime checks in
 * dfo-infra and nowhere incidents are recorded (see StatusTracker/statusData.ts).
 * A page of invented uptime is worse than no page, and the link has been
 * passed around, so the URL 404s rather than only leaving the nav.
 *
 * To bring it back: delete this file's body for the three lines below it,
 * and put Status back in the Header's Docs menu and the Footer's Docs
 * column.
 *
 *   import StatusTracker from '@/components/organisms/StatusTracker/StatusTracker';
 *   const StatusPage = () => (<main><StatusTracker /></main>);
 */
const StatusPage = () => notFound();

export default StatusPage;
