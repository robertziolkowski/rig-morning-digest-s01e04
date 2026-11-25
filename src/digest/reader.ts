import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, RunStatus } from './types.js';

type RunRecord = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

function parseRunRecord(value: unknown): RunRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  if (
    typeof record.at !== 'string' ||
    typeof record.job !== 'string' || record.job.length === 0 ||
    (record.status !== 'ok' && record.status !== 'retry' && record.status !== 'fail') ||
    !(typeof record.owner === 'string' || record.owner === null) ||
    (record.error !== undefined && typeof record.error !== 'string')
  ) {
    return null;
  }

  return {
    at: record.at,
    job: record.job,
    status: record.status,
    owner: record.owner,
    error: typeof record.error === 'string' ? record.error : null,
  };
}

function parseLine(line: string): RunRecord | null {
  try {
    return parseRunRecord(JSON.parse(line) as unknown);
  } catch {
    return null;
  }
}

/** Read one night's JSONL log into one row per job and count malformed lines. */
export function readNight(runsDir: string, night: string): NightDigest {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) {
    throw new Error(`Invalid night: ${night}`);
  }

  const contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  const lines = contents.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();

  const rows = new Map<string, DigestRow>();
  let malformedLines = 0;

  for (const line of lines) {
    const run = parseLine(line);
    if (!run) {
      malformedLines += 1;
      continue;
    }

    const current = rows.get(run.job);
    if (!current) {
      rows.set(run.job, {
        job: run.job,
        owner: run.owner,
        runs: 1,
        retries: run.status === 'retry' ? 1 : 0,
        lastStatus: run.status,
        lastError: run.error,
        firstAt: run.at,
        lastAt: run.at,
      });
      continue;
    }

    current.owner = run.owner;
    current.runs += 1;
    if (run.status === 'retry') current.retries += 1;
    current.lastStatus = run.status;
    if (run.error !== null) current.lastError = run.error;
    current.lastAt = run.at;
  }

  return { rows: [...rows.values()], malformedLines };
}
