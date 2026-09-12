import { Hono } from 'hono';
import { createApp } from './app';

// Vercel's Hono preset detects the entrypoint by a direct `hono` import, so the
// OpenAPIHono app is mounted on a plain Hono root here.
const app = new Hono();
app.route('/', createApp());

export default app;
