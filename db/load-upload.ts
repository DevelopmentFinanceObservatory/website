import { randomUUID } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { Writable } from 'node:stream';

import type { Job, JobLoadMetadata, Table } from '@google-cloud/bigquery';

/** One load job's insert, its file still to be written to the stream loadUpload returns. */
export type LoadRequest = {
    table: Table;
    /** The job's `configuration.load`, its destination table aside. */
    metadata: JobLoadMetadata;
    jobId: string;
    /** The client's request headers, its credentials among them. */
    headers: Headers;
};

/** The URL of a load's multipart upload: the job insert and its file in one request. */
export const uploadUrl = (table: Table): URL =>
    new URL(
        `${table.bigQuery.apiEndpoint}/upload/bigquery/v2/projects/${encodeURIComponent(table.dataset.projectId)}/jobs?uploadType=multipart`,
    );

/** A refusal of the insert, with BigQuery's HTTP status as `code`, as the client's ApiError. */
const refusal = (status: number, body: string): Error => {
    let message = `BigQuery answered the upload with HTTP ${status}`;

    try {
        const parsed: unknown = JSON.parse(body);

        if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'error' in parsed &&
            typeof parsed.error === 'object' &&
            parsed.error !== null &&
            'message' in parsed.error &&
            typeof parsed.error.message === 'string'
        ) {
            message = parsed.error.message;
        }
    } catch {
        // A body that is not JSON leaves the status as the message.
    }

    return Object.assign(new Error(message), { code: status });
};

/**
 * The stream of one load's file, sent as BigQuery's multipart upload: the
 * job insert under `jobId` in the table's location, then the file as the
 * second part. Its HTTP request is the stream's own, so destroying the
 * stream aborts the request and closes its connection, whether or not the
 * body has ended.
 *
 * The stream emits `job` once BigQuery answers the insert with its job, and
 * `complete` once that job is DONE without an error. It fails on any other
 * answer, with the HTTP status as the error's `code`, on a job DONE with an
 * error, and on a request that fails, with Node's error `code`. Its `finish`
 * waits for `complete`.
 */
export const loadUpload = ({ table, metadata, jobId, headers }: LoadRequest): Writable => {
    const url = uploadUrl(table);
    const boundary = randomUUID();
    const insert = {
        configuration: {
            load: {
                ...metadata,
                destinationTable: {
                    projectId: table.dataset.projectId,
                    datasetId: table.dataset.id,
                    tableId: table.id,
                },
            },
        },
        jobReference: { jobId, projectId: table.dataset.projectId, location: table.location },
    };
    const controller = new AbortController();
    const request = (url.protocol === 'http:' ? http : https).request(url, {
        method: 'POST',
        headers: {
            ...Object.fromEntries(headers),
            'content-type': `multipart/related; boundary=${boundary}`,
        },
        signal: controller.signal,
    });
    let job: Job | undefined;
    const stopPolling = () => job?.removeAllListeners('complete').removeAllListeners('error');

    const stream = new Writable({
        write(chunk: Buffer, _encoding, done) {
            if (request.write(chunk)) {
                done();
            } else {
                request.once('drain', () => done());
            }
        },
        final(done) {
            request.end(`\r\n--${boundary}--\r\n`);
            // `finish` waits for the job's end, as the client's stream does.
            stream.once('complete', () => done());
        },
        destroy(error, done) {
            controller.abort();
            stopPolling();
            done(error);
        },
    });

    request.on('error', (error) => stream.destroy(error));
    request.on('response', (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', (error) => stream.destroy(error));
        response.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            const status = response.statusCode ?? 0;

            if (status < 200 || status >= 300) {
                stream.destroy(refusal(status, body));
                return;
            }

            let reference: { jobId?: string; location?: string; projectId?: string } | undefined;

            try {
                reference = (JSON.parse(body) as { jobReference?: typeof reference }).jobReference;
            } catch {
                // A body that is not JSON names no job.
            }

            if (reference?.jobId === undefined) {
                stream.destroy(new Error(`BigQuery answered the upload with no job: ${body}`));
                return;
            }

            job = table.bigQuery.job(reference.jobId, {
                location: reference.location,
                projectId: reference.projectId,
            });
            stream.emit('job', job);
            // The client polls the job while it has a `complete` listener.
            job.on('error', (error: Error) => stream.destroy(error)).on('complete', () => {
                stopPolling();
                stream.emit('complete', job);
            });
        });
    });

    request.write(
        `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(insert)}\r\n` +
            `--${boundary}\r\ncontent-type: application/octet-stream\r\n\r\n`,
    );

    return stream;
};
