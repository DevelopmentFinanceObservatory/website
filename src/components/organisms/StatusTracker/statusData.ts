/**
 * The Status Tracker content. PLACEHOLDERS (design copy, 2026-08-18): there
 * is no status endpoint on the DFO side — when one exists (uptime, incidents,
 * per-service history), this file is the only thing to swap.
 */

export type DayState = 'up' | 'degraded' | 'down';

export type ServiceStatus = 'operational' | 'degraded' | 'outage';

export type Service = {
    id: string;
    name: string;
    status: ServiceStatus;
    // "99.97" — the headline uptime on the row.
    uptime: string;
    // The last 90 days, oldest first.
    days: DayState[];
    stats: { value: string; label: string }[];
};

export type Incident = {
    id: string;
    // ISO date; printed "June 12, 2026".
    date: string;
    title: string;
    text: string;
    resolved: boolean;
    duration: string;
    affected: string;
    time: string;
};

export const STATUS_LABELS: Record<ServiceStatus, string> = {
    operational: 'Operational',
    degraded: 'Degraded',
    outage: 'Outage',
};

// 90 "up" days with a couple of degraded ones where the design shows them.
const history = (degradedAt: number[] = []): DayState[] =>
    Array.from({ length: 90 }, (_, index) => (degradedAt.includes(index) ? 'degraded' : 'up'));

const STATS = [
    { value: '99.81%', label: '30 day uptime' },
    { value: '99.74%', label: '90 day uptime' },
    { value: '<180ms', label: 'Median response time' },
    { value: 'v0.4.0', label: 'Current version' },
];

export const SERVICES: Service[] = [
    {
        id: 'rest-api',
        name: 'REST API',
        status: 'operational',
        uptime: '99.97',
        days: history([21, 63]),
        stats: STATS,
    },
    {
        id: 'mcp-server',
        name: 'MCP Server',
        status: 'operational',
        uptime: '99.97',
        days: history([21, 51, 82]),
        stats: STATS,
    },
    {
        id: 'website',
        name: 'DFO Website',
        status: 'operational',
        uptime: '99.97',
        days: history(),
        stats: [
            { value: '99.99%', label: '30 day uptime' },
            { value: '99.98%', label: '90 day uptime' },
            { value: '<90ms', label: 'Median response time' },
            { value: 'v1.2.0', label: 'Current version' },
        ],
    },
    {
        id: 'auth',
        name: 'Authentication',
        status: 'operational',
        uptime: '99.97',
        days: history([40]),
        stats: [
            { value: '99.95%', label: '30 day uptime' },
            { value: '99.91%', label: '90 day uptime' },
            { value: '<120ms', label: 'Median response time' },
            { value: 'v1.6.0', label: 'Current version' },
        ],
    },
];

const SPIKE = {
    title: 'Elevated API response times',
    text: 'A spike in query volume caused p95 response times to exceed 2s for approximately 40 minutes. No data loss or incorrect results were returned. Additional capacity was provisioned and response times returned to normal.',
    resolved: true,
    duration: '38 minutes',
    affected: 'REST API',
    time: '4:22-15:00 UTC',
};

export const INCIDENTS: Incident[] = [
    { id: 'inc-1', date: '2026-06-12', ...SPIKE },
    { id: 'inc-2', date: '2026-06-12', ...SPIKE },
    { id: 'inc-3', date: '2026-06-12', ...SPIKE },
    {
        id: 'inc-4',
        date: '2026-05-03',
        title: 'MCP Server intermittent timeouts',
        text: 'A subset of MCP tool calls timed out during a rolling deploy. Requests were retried transparently by most clients; no data was affected.',
        resolved: true,
        duration: '12 minutes',
        affected: 'MCP Server',
        time: '09:10-09:22 UTC',
    },
    {
        id: 'inc-5',
        date: '2026-04-18',
        title: 'Sign-in delays',
        text: 'Session creation was slow for some users while the auth database was resized. Existing sessions were unaffected.',
        resolved: true,
        duration: '25 minutes',
        affected: 'Authentication',
        time: '14:00-14:25 UTC',
    },
];

// How many incidents the page shows before "View All".
export const INCIDENTS_PREVIEW = 3;
