/**
 * A stand-in for the Studio harness that plays one recorded scenario. The
 * page's /api/studio/* and /api/presentation/components/* requests reach
 * it through Playwright's `route.continue({ url })`, which keeps a
 * server-sent event stream flowing frame by frame (`route.fulfill` can only
 * send a whole body).
 *
 * It answers the routes the page calls while a conversation plays:
 *
 *   POST /api/studio/turn        the next turn's first segment, as SSE, or
 *                                a card change (`apply_change`,
 *                                `apply_unit`) as `answerChange` says
 *   POST /api/studio/interrupt   the open turn's next segment, as SSE
 *   POST /api/studio/resume      the rest of a running card change, as SSE
 *   POST /api/studio/cancel      200 {}, and the open stream ends
 *   GET  /api/studio/state       the turns played so far and the canvas
 *   GET  /api/studio/places      what `answerPlaces` says
 *   POST /api/studio/composition the canvas with the page's operations
 *   GET  /api/presentation/components/{id}   a card the scenario drew
 *
 * Anything else, a request out of the scenario's order or a question other
 * than the scenario's is a fault, kept in `faults`. Every turn request's
 * body is kept in `requests`.
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
    card_change?: CardChange;
};

type Card = Frame & { payload: Record<string, unknown>; fact_summary: unknown };

/** The card a change turn changed, as the state read names it. */
export type CardChange = {
    component_id: string;
    kind: 'unit' | 'window' | 'places';
    role?: string;
};

/** The harness's answer to a card change: a refusal (422, or 503 for a
 *  places door that is down) in its problem shape, or the change turn's
 *  frames and what the state read records of it. */
export type ChangeAnswer =
    | { refusal: { status: number; body: Record<string, unknown> } }
    | { frames: Frame[]; userMessage: string; change: CardChange };

/** Holds the next stream at its first frame that matches `at`: the frames
 *  before it go out, the player emits `held`, and the stream waits for
 *  `until` and sends the rest in one chunk. A page that leaves meanwhile, or
 *  a connection the harness breaks there (`drop`), leaves a card change's
 *  turn running without a stream, as the harness's turns outlive their
 *  streams, until the page resumes it. */
export type Hold = { at: (frame: Frame) => boolean; until: Promise<void>; drop?: boolean };

// A card change turn running with no stream: its answer and the frames it
// has yet to send.
type Running = { index: number; answer: Extract<ChangeAnswer, { frames: Frame[] }>; rest: Frame[] };

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
    // Every turn request's body, in order.
    readonly requests: Record<string, unknown>[] = [];
    // How a card change is answered; none answers it as a fault.
    answerChange: ((request: Record<string, unknown>) => ChangeAnswer) | null = null;
    // What GET /api/studio/places answers; none answers it as a fault.
    answerPlaces: ((query: URLSearchParams) => { status: number; body: unknown }) | null = null;
    private hold: Hold | null = null;
    private running: Running | null = null;
    // The harness's own turn index: scenario turns and change turns alike.
    private index = 0;
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

    /** The canvas as the frames sent so far leave it. */
    get canvas(): Manifest | null {
        return this.manifest;
    }

    /** The latest `component.created` frame sent for card `id`. */
    card(id: string): Card | undefined {
        return this.cards.get(id);
    }

    /** Holds the next stream (Hold) until the returned call releases it. */
    holdNext(at: Hold['at'], { drop = false } = {}): () => void {
        let release = () => {};

        this.hold = { at, until: new Promise<void>((resolve) => (release = resolve)), drop };

        return () => release();
    }

    // Sends `frames` on `res` as one turn's stream, paced. Resolves with the
    // frames left unsent when the stream broke at a hold (Hold), else null.
    private async send(res: ServerResponse, frames: Frame[]): Promise<Frame[] | null> {
        const hold = this.hold;
        let gone = false;
        const left = new Promise<void>((resolve) =>
            res.on('close', () => {
                gone = true;
                resolve();
            }),
        );

        this.hold = null;
        res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            'x-dfo-turn-index': String(this.index),
        });
        this.open = res;

        const keep = (frame: Frame) => {
            if (frame.event === 'component.created') {
                this.cards.set(String(frame.component_id), frame as Card);
            }

            return `data: ${JSON.stringify(frame)}\n\n`;
        };
        const held = hold ? frames.findIndex(hold.at) : -1;
        let rest: Frame[] | null = null;

        if (hold && held < 0) {
            this.fault(`turn ${this.index}: no frame to hold the stream at`);
        }

        for (const [at, frame] of frames.entries()) {
            if (at === held && hold) {
                this.emit('held');
                await Promise.race([hold.until, left]);

                if (gone || hold.drop) {
                    rest = frames.slice(at);
                    res.destroy();
                } else {
                    res.write(frames.slice(at).map(keep).join(''));
                }

                break;
            }

            await sleep(frame.event === 'message.delta' ? DELTA_MS : FRAME_MS);

            if (gone) {
                this.fault(`turn ${this.index}: the page closed the stream early`);
                break;
            }

            res.write(keep(frame));
        }

        this.open = null;
        res.end();

        return rest;
    }

    private async stream(res: ServerResponse) {
        const turn = this.scenario.turns[this.turn - 1]!;
        const { frames } = turn.segments[this.segment]!;

        if (this.segment === 0) {
            this.index += 1;
        }

        await this.send(res, frames);
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

    // A card change the harness admitted: its own turn, streamed, or left
    // running when its stream broke at a hold.
    private async change(res: ServerResponse, answer: Running['answer']) {
        this.index += 1;
        await this.carry(res, this.index, answer, answer.frames);
    }

    // Streams `frames` of change turn `index`, and closes the turn once its
    // last frame is out.
    private async carry(
        res: ServerResponse,
        index: number,
        answer: Running['answer'],
        frames: Frame[],
    ) {
        const rest = await this.send(res, frames);

        if (rest) {
            this.running = { index, answer, rest };

            return;
        }

        this.running = null;
        this.manifest = manifestAfter(answer.frames, this.manifest);
        this.close(answer.userMessage, answer.frames, answer.change);
        this.emit('change-end', { index });
    }

    // The closed turn the state read reports.
    private close(question: string, frames: Frame[], change?: CardChange) {
        const created = frames.filter((frame) => frame.event === 'component.created');
        const failed = frames.find((frame) => frame.event === 'error')?.error as
            { error: string } | undefined;

        this.closed.push({
            turn_index: this.index,
            user_message: question,
            reply: String(
                frames.findLast((frame) => frame.event === 'message.complete')?.text ?? '',
            ),
            component_ids: created.map((frame) => String(frame.component_id)),
            // Each card as the harness stores it: its frame's offers, the
            // card it replaced, and the plan step it was drawn for.
            cards: created.map((frame) => {
                const from = frame.created_from as Record<string, unknown> | undefined;

                return {
                    component_id: frame.component_id,
                    type: frame.type,
                    title: (frame.payload as { component: { title: { text: string } } }).component
                        .title.text,
                    revision: frame.revision,
                    fact_summary: frame.fact_summary,
                    unit_change: frame.unit_change ?? null,
                    card_changes: frame.card_changes ?? null,
                    replaces: frame.replaces ?? null,
                    plan_version_id: from?.plan_version_id ?? null,
                    plan_step_id: from?.plan_step_id ?? null,
                };
            }),
            approved: frames.filter((frame) => frame.event === 'plan.approved'),
            error: failed?.error ?? null,
            new_question: null,
            ...(change && { card_change: change }),
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
                this.requests.push(body ?? {});

                if (body?.apply_change || body?.apply_unit) {
                    const answer = this.answerChange?.(body);

                    if (!answer) {
                        this.fault('a card change the scenario does not answer');

                        return json(501, { error: 'not_implemented', detail: 'No change answer.' });
                    }

                    return 'refusal' in answer
                        ? json(answer.refusal.status, answer.refusal.body)
                        : this.change(res, answer);
                }

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
            case 'POST /api/studio/resume': {
                const running = this.running;

                if (!running || body?.turn_index !== running.index) {
                    this.fault(
                        `a resume of turn ${String(body?.turn_index)}, which is not running`,
                    );

                    return json(409, {
                        error: 'edit_conflict',
                        retry: 'do_not_retry',
                        detail: 'No turn is running.',
                    });
                }

                return this.carry(res, running.index, running.answer, running.rest);
            }
            case 'POST /api/studio/cancel':
                this.open?.end();

                return json(200, {});
            case 'GET /api/studio/state': {
                const since = Number(url.searchParams.get('since') ?? 0);
                const latest = this.closed.at(-1);
                const running = this.running;

                return json(200, {
                    conversation_id: url.searchParams.get('conversation_id'),
                    turn: running
                        ? {
                              index: running.index,
                              status: 'running',
                              trace_id: `tr_replay_${running.index}`,
                              user_message: running.answer.userMessage,
                              card_change: running.answer.change,
                              lease_live: false,
                          }
                        : latest
                          ? {
                                index: latest.turn_index,
                                status: latest.error ? 'failed' : 'done',
                                trace_id: `tr_replay_${latest.turn_index}`,
                                user_message: latest.user_message,
                                approved: latest.approved,
                                ...(latest.card_change && { card_change: latest.card_change }),
                                lease_live: false,
                            }
                          : null,
                    closed_since: this.closed.filter((one) => one.turn_index > since).slice(0, 3),
                    closed_total: this.closed.length,
                    pause: null,
                    manifest: this.manifest,
                });
            }
            case 'GET /api/studio/places': {
                const answer = this.answerPlaces?.(url.searchParams);

                if (!answer) {
                    break;
                }

                return json(answer.status, answer.body);
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
