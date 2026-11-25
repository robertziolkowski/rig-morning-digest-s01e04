import { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from './reader.js';

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/** Create the JSON digest route without coupling it to the main app. */
export function createDigestApiRouter(config: RigConfig) {
  const router = new Hono();

  router.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) {
      return c.json({ error: 'not found' }, 404);
    }

    try {
      const digest = readNight(config.runsDir, night);
      const rows = [...digest.rows].sort((left, right) => left.job.localeCompare(right.job));
      return c.json({ ...digest, rows });
    } catch (error) {
      if (isMissingFile(error)) return c.json({ error: 'not found' }, 404);
      throw error;
    }
  });

  return router;
}
