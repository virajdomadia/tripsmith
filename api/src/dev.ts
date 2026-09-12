import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { env } from './env';

serve({ fetch: createApp().fetch, port: env.PORT }, (i) =>
  console.log(`api on http://localhost:${i.port} — docs at /docs`),
);
