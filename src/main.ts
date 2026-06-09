import 'dotenv/config';
import { createApp } from './server.js';

const { app, port } = createApp();
await app.listen({ port, host: '0.0.0.0' });
console.log(`Web listening on http://localhost:${port}`);
