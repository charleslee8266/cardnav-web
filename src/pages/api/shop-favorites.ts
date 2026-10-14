import type { APIRoute } from 'astro';
import { MAX_FAVORITE_BODY_BYTES, parseFavoriteSnapshot, saveFavoriteSnapshot } from '../../shop-favorites.js';

const recentRequests = new Map<string, { count: number; expiresAt: number }>();

export const POST: APIRoute = async ({ request, url }) => {
  const respond = (status: number) => new Response(null, { status, headers: { 'cache-control': 'no-store' } });
  const allowedOrigins = new Set([url.origin]);
  if (process.env.PUBLIC_SITE_URL) allowedOrigins.add(new URL(process.env.PUBLIC_SITE_URL).origin);
  if (!allowedOrigins.has(request.headers.get('origin') || '')
    || request.headers.get('sec-fetch-site') === 'cross-site') return respond(403);
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return respond(415);
  if (Number(request.headers.get('content-length')) > MAX_FAVORITE_BODY_BYTES) return respond(413);
  const reader = request.body?.getReader();
  if (!reader) return respond(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FAVORITE_BODY_BYTES) { await reader.cancel(); return respond(413); }
      chunks.push(value);
    }
  } catch { return respond(400); }
  let input;
  try { input = parseFavoriteSnapshot(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
  catch { return respond(400); }
  if (!input) return respond(400);
  const now = Date.now();
  for (const [key, entry] of recentRequests) if (entry.expiresAt <= now) recentRequests.delete(key);
  const rate = recentRequests.get(input.visitorId);
  if (rate && rate.count >= 30) return respond(429);
  if (!rate && recentRequests.size >= 10_000) return respond(429);
  recentRequests.set(input.visitorId, { count: (rate?.count ?? 0) + 1, expiresAt: rate?.expiresAt ?? now + 60_000 });
  try { await saveFavoriteSnapshot(input); }
  catch (error) { console.error('Unable to synchronize favorites', error); return respond(503); }
  return respond(204);
};
