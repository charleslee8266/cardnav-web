/** Read-only image serving from a configured persistent directory. */
import 'dotenv/config';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { publicSponsorBrowserCacheControl, publicSponsorMediaCloudflareCacheControl } from './public-data-cache.js';

const mimeTypes: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
};

export async function servePersistentMedia(directory: string | undefined, filename: string | undefined, method = 'GET'): Promise<Response> {
  if (!directory || !path.isAbsolute(directory)) return new Response(null, { status: 404 });
  if (!filename || filename === '.' || filename === '..' || /[/\\\x00-\x1f\x7f]/.test(filename)) {
    return new Response(null, { status: 404 });
  }
  const mimeType = mimeTypes[path.extname(filename).toLowerCase()];
  if (!mimeType) return new Response(null, { status: 404 });
  let handle;
  try {
    const root = await realpath(directory);
    handle = await open(path.join(root, filename), constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile()) return new Response(null, { status: 404 });
    const body = method === 'HEAD' ? null : new Uint8Array(await handle.readFile());
    return new Response(body, { headers: {
      'Content-Type': mimeType,
      'Content-Length': String(stat.size),
      'Cache-Control': publicSponsorBrowserCacheControl,
      'Cloudflare-CDN-Cache-Control': publicSponsorMediaCloudflareCacheControl,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
    } });
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      return new Response(null, { status: 404 });
    }
    console.error('Unable to serve image', error);
    return new Response(null, { status: 500 });
  } finally {
    await handle?.close();
  }
}
