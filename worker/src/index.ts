import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { accountsRoutes } from './routes/accounts';
import { bedsRoutes } from './routes/beds';
import { billingRoutes } from './routes/billing';
import { bloodBankRoutes } from './routes/bloodbank';
import { opdRoutes } from './routes/opd';
import { recordsRoutes } from './routes/records';
import type { AppEnv } from './utils';

const app = new Hono<AppEnv>({ strict: false });

app.use(
  '/api/*',
  cors({
    origin: (origin) => {
      if (!origin) return '*';
      if (
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin.endsWith('.workers.dev') ||
        origin.endsWith('.pages.dev')
      ) {
        return origin;
      }
      return '';
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Disposition'],
    credentials: true,
  })
);

app.use('/api/*', async (c, next) => {
  const start = Date.now();
  await next();
  console.log(
    JSON.stringify({
      message: 'api_request',
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      duration_ms: Date.now() - start,
    })
  );
});

app.onError((err, c) => {
  console.error(
    JSON.stringify({
      message: 'worker_error',
      path: new URL(c.req.url).pathname,
      error: err instanceof Error ? err.message : String(err),
    })
  );
  return c.json({ detail: 'Internal server error.' }, 500);
});

app.get('/api/health', (c) =>
  c.json({
    status: 'ok',
    service: 'smartcare-hms-api',
    runtime: 'cloudflare-workers-d1',
  })
);

app.route('/api/accounts', accountsRoutes);
app.route('/api/auth', accountsRoutes);
app.route('/api/opd', opdRoutes);
app.route('/api/beds', bedsRoutes);
app.route('/api/bloodbank', bloodBankRoutes);
app.route('/api/records', recordsRoutes);
app.route('/api/billing', billingRoutes);

app.all('/api/*', (c) => c.json({ detail: 'API endpoint not found.' }, 404));

app.all('*', async (c) => {
  const assets = (c.env as Env & { ASSETS?: Fetcher }).ASSETS;
  if (assets) return assets.fetch(c.req.raw);
  return c.text('Not Found', 404);
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
