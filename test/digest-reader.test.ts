import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const temporaryDirectories: string[] = [];

function makeRunsDir(): string {
  const path = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  temporaryDirectories.push(path);
  return path;
}

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('readNight', () => {
  it('aggregates the checked-in fixture and counts its truncated line', () => {
    const runsDir = join(process.cwd(), 'runs');
    const result = readNight(runsDir, '2026-10-28');

    expect(result.rows).toHaveLength(5);
    expect(result.malformedLines).toBe(1);
    expect(result.rows.find((row) => row.job === 'fixtures/refresh')).toMatchObject({
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(result.rows.find((row) => row.job === 'digest/render')?.owner).toBeNull();
  });

  it('aggregates a temporary run log and preserves the timestamp offsets', () => {
    const runsDir = makeRunsDir();
    writeFileSync(join(runsDir, '2026-11-01.jsonl'), [
      JSON.stringify({ at: '2026-11-01T08:00:00-04:00', job: 'a', status: 'retry', owner: null, error: 'temporary' }),
      JSON.stringify({ at: '2026-11-01T08:02:00-04:00', job: 'a', status: 'fail', owner: null, error: 'still failing' }),
      '',
    ].join('\n'));

    expect(readNight(runsDir, '2026-11-01')).toEqual({
      rows: [{
        job: 'a',
        owner: null,
        runs: 2,
        retries: 1,
        lastStatus: 'fail',
        lastError: 'still failing',
        firstAt: '2026-11-01T08:00:00-04:00',
        lastAt: '2026-11-01T08:02:00-04:00',
      }],
      malformedLines: 0,
    });
  });

  it('returns no rows for an empty file and counts malformed records without throwing', () => {
    const runsDir = makeRunsDir();
    writeFileSync(join(runsDir, '2026-11-02.jsonl'), '');
    writeFileSync(join(runsDir, '2026-11-03.jsonl'), '{broken json\n{"at":"x","job":"bad","status":"other","owner":"n"}\n');

    expect(readNight(runsDir, '2026-11-02')).toEqual({ rows: [], malformedLines: 0 });
    expect(readNight(runsDir, '2026-11-03')).toEqual({ rows: [], malformedLines: 2 });
  });
});
