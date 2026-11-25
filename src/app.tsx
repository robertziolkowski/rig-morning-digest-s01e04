import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { readNight } from './digest/reader.js';
import { createDigestApiRouter } from './digest/api.js';
import { createDigestPageRouter } from './digest/page.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.route('/', createDigestPageRouter(config));
  app.route('/', createDigestApiRouter(config));

  app.get('/', (c) => {
    const status = readStatus(config);
    const digestCounts = Object.fromEntries(
      status.nights.map((night) => {
        const rows = readNight(config.runsDir, night).rows;
        const counts = { ok: 0, retry: 0, fail: 0 };
        for (const row of rows) counts[row.lastStatus] += 1;
        return [night, counts];
      }),
    );

    return c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={status} digestCounts={digestCounts} />
      </Layout>,
    );
  });

  return app;
}
