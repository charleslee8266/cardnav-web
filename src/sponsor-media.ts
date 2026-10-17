/** Serves uploaded sponsor images from the configured persistent directory. */
import { servePersistentMedia } from './persistent-media.js';
export function serveSponsorMedia(filename: string | undefined, method = 'GET') {
  return servePersistentMedia(process.env.MEDIA_UPLOAD_DIR,filename,method);
}
