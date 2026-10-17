import type { APIRoute } from 'astro';
import path from 'node:path';
import { servePersistentMedia } from '../../../persistent-media.js';
export const GET: APIRoute = ({params,request}) => {
  const gallery=process.env.MEDIA_UPLOAD_DIR;
  if (!gallery || !path.isAbsolute(gallery) || !/^[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(params.filename ?? '')) return new Response(null,{status:404});
  const directory=path.join(path.dirname(gallery),'articles');
  if (path.resolve(directory)===path.resolve(gallery)) return new Response(null,{status:404});
  return servePersistentMedia(directory,params.filename,request.method);
};
export const HEAD=GET;
