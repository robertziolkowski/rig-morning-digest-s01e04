import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const night = '2026-11-01';
const configBase = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
};

let runsDir: string;

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function writeNight(contents: string): void {
  writeFileSync(join(runsDir, `${night}.jsonl`), contents);
}

function runRecord(job: string, status: 'ok' | 'retry' | 'fail', owner: string | null, error?: string): string {
  return JSON.stringify({ at: `2026-11-01T08:00:00-04:00`, job, status, owner, ...(error ? { error } : {}) });
}

function app() {
  return createApp({ ...configBase, runsDir });
}

describe('digest routes', () => {
  it('serves the same sorted rows in HTML and JSON', async () => {
    writeNight([
      runRecord('z/backup', 'fail', null, 'quota exceeded'),
      runRecord('a/sync', 'retry', 'lane-07'),
      runRecord('a/sync', 'ok', 'lane-07'),
      '',
    ].join('\n'));

    const server = app();
    const htmlResponse = await server.request(`/digest/${night}`);
    const html = await htmlResponse.text();
    const jsonResponse = await server.request(`/api/digest/${night}`);
    const digest = await jsonResponse.json();

    expect(htmlResponse.status).toBe(200);
    expect(html).toContain('digest · 2026-11-01');
    expect(html).toContain('quota exceeded');
    expect(html).toContain('—');
    expect(html.indexOf('<td>a/sync</td>')).toBeLessThan(html.indexOf('<td>z/backup</td>'));
    expect(html).toContain('<tr class="warn">');

    expect(jsonResponse.status).toBe(200);
    expect(digest).toMatchObject({
      malformedLines: 0,
      rows: [
        { job: 'a/sync', owner: 'lane-07', runs: 2, retries: 1, lastStatus: 'ok' },
        { job: 'z/backup', owner: null, runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded' },
      ],
    });
  });

  it('returns 404 for a night with no file', async () => {
    const server = app();

    expect((await server.request(`/digest/${night}`)).status).toBe(404);
    expect((await server.request(`/api/digest/${night}`)).status).toBe(404);
  });

  it('renders an empty night and returns no rows', async () => {
    writeNight('');
    const server = app();
    const htmlResponse = await server.request(`/digest/${night}`);
    const jsonResponse = await server.request(`/api/digest/${night}`);

    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({ rows: [], malformedLines: 0 });
  });

  it('counts malformed lines while serving the valid rows', async () => {
    writeNight([
      '{broken json',
      runRecord('a/sync', 'ok', null),
      '',
    ].join('\n'));
    const server = app();
    const htmlResponse = await server.request(`/digest/${night}`);
    const jsonResponse = await server.request(`/api/digest/${night}`);
    const digest = await jsonResponse.json();

    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain('1 malformed line(s) skipped.');
    expect(jsonResponse.status).toBe(200);
    expect(digest).toMatchObject({ malformedLines: 1, rows: [{ job: 'a/sync' }] });
  });

  it('links status-board nights and shows their current status counts', async () => {
    writeNight([
      runRecord('a/ok', 'ok', 'lane-07'),
      runRecord('b/retry', 'retry', 'lane-07'),
      runRecord('c/fail', 'fail', 'lane-07', 'failed'),
      '',
    ].join('\n'));
    writeFileSync(join(runsDir, '2026-10-31.jsonl'), runRecord('old/job', 'ok', 'rook'));

    const response = await app().request('/');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('href="/digest/2026-11-01"');
    expect(html).toContain('href="/digest/2026-10-31"');
    expect(html).toContain('ok 1 · retry 1 · fail 1');
  });
});
