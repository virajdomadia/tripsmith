import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { env } from '../../env';

export const health = new OpenAPIHono();

health.openapi(
  createRoute({
    method: 'get',
    path: '/health',
    tags: ['system'],
    responses: {
      200: {
        description: 'Liveness',
        content: {
          'application/json': {
            schema: z.object({ ok: z.literal(true), version: z.string(), time: z.string() }),
          },
        },
      },
    },
  }),
  (c) =>
    c.json({
      ok: true as const,
      version: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
      time: new Date().toISOString(),
    }),
);
