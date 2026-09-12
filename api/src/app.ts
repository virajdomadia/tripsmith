import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { logger } from 'hono/logger';
import { ApiError, ROOT_FIELD } from './errors';
import { health } from './routes/public/health';

export function createApp() {
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        // One message per field (first issue wins); object-level refine issues land under ROOT_FIELD.
        const fieldErrors: Record<string, string> = {};
        for (const i of result.error.issues)
          fieldErrors[i.path.join('.') || ROOT_FIELD] ??= i.message;
        return c.json(new ApiError('validation', 'Invalid request', fieldErrors).body(), 400);
      }
    },
  });
  app.use('*', logger());
  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json(err.body(), err.status);
    console.error(err);
    return c.json(new ApiError('internal', 'Something went wrong').body(), 500);
  });
  app.notFound((c) =>
    c.json(new ApiError('not_found', `No route for ${c.req.method} ${c.req.path}`).body(), 404),
  );
  app.route('/', health);
  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Tripsmith API',
      version: '1.0.0',
      description: 'Public catalog API for tripsmith.vercel.app',
    },
  });
  app.get('/docs', Scalar({ url: '/openapi.json', theme: 'kepler' }));
  return app;
}
export type App = ReturnType<typeof createApp>;
