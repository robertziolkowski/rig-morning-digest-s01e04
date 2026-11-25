export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  rows: DigestRow[];
  malformedLines: number;
};

/** Read one night's JSONL log into per-job rows and a malformed-line count. */
export declare function readNight(runsDir: string, night: string): NightDigest;
