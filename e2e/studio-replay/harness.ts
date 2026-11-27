/**
 * A stand-in for the Studio harness that plays one recorded scenario. The
 * page's /api/studio/* and /api/presentation/components/* requests reach
 * it through Playwright's `route.continue({ url })`, which keeps a
 * server-sent event stream flowing frame by frame (`route.fulfill` can only
 * send a whole body).
 *
 * It answers the routes the page calls while a conversation plays:
 *
 *   POST /api/studio/turn        the next turn's first segment, as SSE
 *   POST /api/studio/interrupt   the open turn's next segment, as SSE
 *   POST /api/studio/cancel      200 {}, and the open stream ends
 *   GET  /api/studio/state       the turns played so far and the canvas
 *   POST /api/studio/composition the canvas with the page's operations
 *   GET  /api/presentation/components/{id}   a card the scenario drew
 *
 * Anything else, a request out of the scenario's order or a question other
 * than the scenario's is a fault, kept in `faults`.
 */
import { EventEmitter } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { type Frame, type Manifest, manifestAfter, type Scenario } from './scenario.ts';

// The pause between two frames, and between two message.delta frames.
const FRAME_MS = 30;
const DELTA_MS = 15;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Closed = {
    turn_index: number;
    user_message: string;
    reply: string;
    component_ids: string[];
    cards: unknown[];
    approved: Frame[];
    error: string | null;
    new_question: null;
};

type Card = { payload: Record<string, unknown>; fact_summary: unknown };

/** Plays `scenario`'s turns in order and emits `segment-end` with the turn
 *  (from 1) and segment (from 0) after each segment's last frame. */
export class Player extends EventEmitter {
    readonly scenario: Scenario;
    readonly faults: string[] = [];
    // Interrupt requests received: the page's answers to pauses.
    interrupts = 0;
    // The next turn to play, and the segment of it to play next.
    turn = 1;
    segment = 0;
    private manifest: Manifest | null = null;
    private readonly closed: Closed[] = [];
    private readonly cards = new Map<string, Card>();
    private open: ServerResponse | null = null;

    constructor(scenario: Scenario) {
        super();
        this.scenario = scenario;
    }

    private fault(text: string) {
        this.faults.push(text);
    }

    private async stream(res: ServerResponse) {
        const turn = this.scenario.turns[this.turn - 1]!;
        const { frames } = turn.segments[this.segment]!;
        let gone = false;

        res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            'x-dfo-turn-index': String(this.turn),
        });
        res.on('close', () => {
            gone = true;
        });
        this.open = res;

        for (const frame of frames) {
            await sleep(frame.event === 'message.delta' ? DELTA_MS : FRAME_MS);

            if (gone) {
                this.fault(`turn ${this.turn}: the page closed the stream early`);
                break;
            }

            res.write(`data: ${JSON.stringify(frame)}\n\n`);

            if (frame.event === 'component.created') {
                this.cards.set(String(frame.component_id), frame as unknown as Card);
            }
        }

        this.open = null;
        res.end();
        this.manifest = manifestAfter(frames, this.manifest);

        const ended = { turn: this.turn, segment: this.segment };

        if (this.segment + 1 < turn.segments.length) {
            this.segment += 1;
        } else {
            this.close(
                turn.question,
                turn.segments.flatMap((one) => one.frames),
            );
            this.turn += 1;
            this.segment = 0;
        }

        this.emit('segment-end', ended);
    }

    // The closed turn the state read reports.
    private close(question: string, frames: Frame[]) {
        const created = frames.filter((frame) => frame.event === 'component.created');
        const failed = frames.find((frame) => frame.event === 'error')?.error as
            { error: string } | undefined;

        this.closed.push({
            turn_index: this.turn,
            user_message: question,
            reply: String(
                frames.findLast((frame) => frame.event === 'message.complete')?.text ?? '',
            ),
            component_ids: created.map((frame) => String(frame.component_id)),
            cards: created.map((frame) => ({
                component_id: frame.component_id,
                type: frame.type,
                title: (frame.payload as { component: { title: { text: string } } }).component.title
                    .text,
                revision: frame.revision,
                fact_summary: frame.fact_summary,
            })),
            approved: frames.filter((frame) => frame.event === 'plan.approved'),
            error: failed?.error ?? null,
            new_question: null,
        });
    }

    async handle(req: IncomingMessage, res: ServerResponse) {
        const url = new URL(req.url ?? '/', 'http://replay');
        let text = '';

        for await (const chunk of req) {
            text += chunk;
        }

        let body: Record<string, unknown> | null = null;

        try {
            body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
        } catch {
            this.fault(`${req.method} ${url.pathname}: body is not JSON`);
        }

        const json = (status: number, value: unknown) => {
            res.writeHead(status, { 'content-type': 'application/json' });
            res.end(JSON.stringify(value));
        };
        const turn = this.scenario.turns[this.turn - 1];

        switch (`${req.method} ${url.pathname}`) {
            case 'POST /api/studio/turn': {
                if (!turn || this.segment !== 0) {
                    this.fault(`a turn request with no turn ready (turn ${this.turn})`);

                    return json(409, {
                        error: 'edit_conflict',
                        retry: 'do_not_retry',
                        detail: 'No turn is ready.',
                    });
                }

                if (body?.message !== turn.question) {
                    this.fault(
                        `turn ${this.turn}: asked ${JSON.stringify(body?.message)}, expected ${JSON.stringify(turn.question)}`,
                    );
                }

                return this.stream(res);
            }
            case 'POST /api/studio/interrupt': {
                this.interrupts += 1;
                const segment = turn?.segments[this.segment];

                if (!turn || this.segment === 0 || !segment) {
                    this.fault(`an interrupt with no pause open (turn ${this.turn})`);

                    return json(404, {
                        error: 'not_found',
                        retry: 'do_not_retry',
                        detail: 'No pause is open.',
                        pointer: '/interrupt_id',
                    });
                }

                for (const [member, value] of Object.entries(segment.expect ?? {})) {
                    if (body?.[member] !== value) {
                        this.fault(
                            `interrupt ${member}: got ${JSON.stringify(body?.[member])}, expected ${JSON.stringify(value)}`,
                        );
                    }
                }

                return this.stream(res);
            }
            case 'POST /api/studio/cancel':
                this.open?.end();

                return json(200, {});
            case 'GET /api/studio/state': {
                const since = Number(url.searchParams.get('since') ?? 0);
                const latest = this.closed.at(-1);

                return json(200, {
                    conversation_id: url.searchParams.get('conversation_id'),
                    turn: latest
                        ? {
                              index: latest.turn_index,
                              status: latest.error ? 'failed' : 'done',
                              trace_id: `tr_replay_${latest.turn_index}`,
                              user_message: latest.user_message,
                              approved: latest.approved,
                              lease_live: false,
                          }
                        : null,
                    closed_since: this.closed.filter((one) => one.turn_index > since).slice(0, 3),
                    closed_total: this.closed.length,
                    pause: null,
                    manifest: this.manifest,
                });
            }
            case 'POST /api/studio/composition':
                return json(200, this.compose((body?.operations ?? []) as Operation[]));
            default:
                break;
        }

        const read = /^\/api\/presentation\/components\/([^/]+)$/.exec(url.pathname);
        const card =
            read && req.method === 'GET' ? this.cards.get(decodeURIComponent(read[1]!)) : null;

        if (card) {
            return json(200, {
                component_id: decodeURIComponent(read![1]!),
                revision: Number(url.searchParams.get('revision') ?? 1),
                catalog_version: card.payload.catalog_version,
                composition_id: null,
                composition_revision: null,
                resolved_payload: card.payload,
                fact_summary: card.fact_summary,
            });
        }

        this.fault(`no answer for ${req.method} ${url.pathname}`);

        return json(501, {
            error: 'not_implemented',
            detail: 'The replay does not answer this route.',
        });
    }

    // The canvas with the page's own operations applied, one revision on.
    private compose(operations: Operation[]): Manifest {
        const manifest: Manifest = structuredClone(this.manifest) ?? {
            revision: 0,
            actor: 'user',
            blocks: [],
        };

        for (const operation of operations) {
            const at = manifest.blocks.findIndex(
                (block) => block.component_id === operation.component_id,
            );

            if (operation.op === 'remove' && at >= 0) {
                manifest.blocks.splice(at, 1);
            } else if ((operation.op === 'pin' || operation.op === 'unpin') && at >= 0) {
                Object.assign(manifest.blocks[at]!, { pinned: operation.op === 'pin' });
            } else if (operation.op === 'reorder' && operation.order) {
                const order = operation.order;

                manifest.blocks.sort(
                    (a, b) => order.indexOf(a.component_id) - order.indexOf(b.component_id),
                );
            } else if (operation.op === 'set_layout_hints') {
                manifest.layout_hints = operation.layout_hints;
            } else if (operation.op === 'set_card_meta' && at >= 0) {
                Object.assign(manifest.blocks[at]!, { meta: operation.meta });
            } else {
                this.fault(`composition operation ${operation.op} the replay does not apply`);
            }
        }

        manifest.revision += 1;
        manifest.actor = 'user';
        this.manifest = manifest;

        return manifest;
    }
}

type Operation = {
    op: string;
    component_id?: string;
    order?: string[];
    layout_hints?: unknown;
    meta?: unknown;
};

/** Serves `player` on a free localhost port. */
export const serveHarness = async (player: Player) => {
    const server = createServer((req, res) => {
        player.handle(req, res).catch((error: unknown) => {
            player.faults.push(`harness: ${String(error)}`);
            res.destroy();
        });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    return {
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        close: () =>
            new Promise<void>((resolve) => {
                server.closeAllConnections();
                server.close(() => resolve());
            }),
    };
};
