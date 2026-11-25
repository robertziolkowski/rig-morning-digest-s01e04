import { Hono } from 'hono';
import type { DigestRow, NightDigest } from './types.js';
import { readNight } from './reader.js';
import { lane } from '../lane.js';
import type { RigConfig } from '../config.js';
import { Layout } from '../views/layout.js';

function byJob(rows: DigestRow[]): DigestRow[] {
  return [...rows].sort((a, b) => a.job.localeCompare(b.job));
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function DigestTable({ digest }: { digest: NightDigest }) {
  const rows = byJob(digest.rows);

  if (rows.length === 0) {
    return (
      <>
        <p class="mute">nothing ran</p>
        {digest.malformedLines > 0 && (
          <p class="mute">{digest.malformedLines} malformed line(s) skipped.</p>
        )}
      </>
    );
  }

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>job</th>
            <th>owner</th>
            <th>runs</th>
            <th>retries</th>
            <th>last status</th>
            <th>last error</th>
            <th>first time</th>
            <th>last time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr class={row.retries >= 3 || row.lastStatus === 'fail' ? 'warn' : undefined}>
              <td>{row.job}</td>
              <td>{row.owner ?? '—'}</td>
              <td>{row.runs}</td>
              <td>{row.retries}</td>
              <td>{row.lastStatus}</td>
              <td>{row.lastError ?? '—'}</td>
              <td>{row.firstAt}</td>
              <td>{row.lastAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {digest.malformedLines > 0 && (
        <p class="mute">{digest.malformedLines} malformed line(s) skipped.</p>
      )}
    </>
  );
}

/** Route for a rendered nightly digest. Mount this router in the main Hono app. */
export function createDigestPageRouter(config: RigConfig) {
  const router = new Hono();

  router.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return c.notFound();

    let digest: NightDigest;
    try {
      digest = readNight(config.runsDir, night);
    } catch (error) {
      if (isMissingFile(error)) return c.notFound();
      throw error;
    }

    return c.html(
      <Layout title={`digest ${night}`} lane={lane()}>
        <h1>digest · {night}</h1>
        <DigestTable digest={digest} />
      </Layout>,
    );
  });

  return router;
}
