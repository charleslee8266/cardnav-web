/** Synchronize the browser's complete shop favorites; local favorites remain usable offline. */
export const favoriteStorageKeys = {
  product: 'cardnav.favoriteProducts',
  site: 'cardnav.favoriteSites',
};
const productIdMapKey = 'cardnav.favoriteProductIds';
const stateKey = 'cardnav.shopFavoriteSync';
const visitorKey = 'cardnav.visitorId';
const stateLock = 'cardnav.shopFavorites.state';
const sendLock = 'cardnav.shopFavorites.send';
type SyncState = { revision: number; fingerprint: string; syncedDay?: string; syncedRevision?: number };
let timer: ReturnType<typeof setTimeout> | undefined;
let started = false;

export function readShopFavorites(key: string): Set<string> {
  const value: unknown = JSON.parse(localStorage.getItem(key) || '[]');
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error('Invalid favorites');
  return new Set(value);
}

function readSnapshot() {
  const mapping = JSON.parse(localStorage.getItem(productIdMapKey) || '{}') as Record<string, unknown>;
  const productIds: string[] = [];
  const productKeys: string[] = [];
  for (const key of readShopFavorites(favoriteStorageKeys.product)) {
    const id = Object.hasOwn(mapping, key) ? mapping[key] : undefined;
    if (typeof id === 'string' && id) productIds.push(id); else productKeys.push(key);
  }
  return { productIds: [...new Set(productIds)].sort(), productKeys: productKeys.sort(),
    siteIds: [...readShopFavorites(favoriteStorageKeys.site)].sort() };
}

function readState(): SyncState | null {
  const raw = localStorage.getItem(stateKey);
  if (!raw) return null;
  const value = JSON.parse(raw) as SyncState;
  if (!Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.fingerprint !== 'string') return null;
  return value;
}

function dayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function withStateLock<T>(action: () => T | Promise<T>): Promise<T> {
  // Web Locks serializes reads and writes across tabs on the same origin.
  return navigator.locks.request(stateLock, action);
}

export async function toggleShopFavorite(kind: 'product' | 'site', key: string, productId?: string): Promise<void> {
  const change = () => {
    const storageKey = favoriteStorageKeys[kind];
    const values = readShopFavorites(storageKey);
    if (values.has(key)) values.delete(key); else values.add(key);
    if (kind === 'product') {
      const mapping = JSON.parse(localStorage.getItem(productIdMapKey) || '{}');
      if (!values.has(key)) delete mapping[key];
      else if (productId) Object.defineProperty(mapping, key, { value: productId, enumerable: true, configurable: true, writable: true });
      localStorage.setItem(productIdMapKey, JSON.stringify(mapping));
    }
    localStorage.setItem(storageKey, JSON.stringify([...values]));
    window.dispatchEvent(new Event('shop-favorites-changed'));
  };
  if (navigator.locks) await withStateLock(change); else change();
}

export async function syncShopFavorites(): Promise<void> {
  // Without cross-tab locking, keep favorites local rather than race snapshot replacement.
  if (!navigator.locks) return;
  try {
    await navigator.locks.request(sendLock, { ifAvailable: true }, async lock => {
      if (!lock) return;
      const pending = await withStateLock(() => {
        const snapshot = readSnapshot();
        const { productIds, productKeys, siteIds } = snapshot;
        const fingerprint = JSON.stringify(snapshot);
        const prior = readState();
        if (!prior && !productIds.length && !productKeys.length && !siteIds.length) return null;
        if (prior?.fingerprint === fingerprint && prior.syncedRevision === prior.revision
          && (prior.syncedDay === dayKey() || (!productIds.length && !productKeys.length && !siteIds.length))) return null;
        let visitorId = localStorage.getItem(visitorKey);
        if (!visitorId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(visitorId)) {
          visitorId = crypto.randomUUID();
          localStorage.setItem(visitorKey, visitorId);
        }
        const revision = prior?.fingerprint === fingerprint && prior.syncedRevision !== prior.revision
          ? prior!.revision : Math.max(Date.now(), (prior?.revision ?? 0) + 1);
        const state: SyncState = { revision, fingerprint };
        localStorage.setItem(stateKey, JSON.stringify(state));
        return { visitorId, revision, productIds, productKeys, siteIds, fingerprint, day: dayKey() };
      });
      if (!pending) return;
      const { fingerprint, day, ...payload } = pending;
      try {
        const response = await fetch('/api/shop-favorites', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) return;
        await withStateLock(() => {
          const current = readState();
          if (current?.revision === pending.revision && current.fingerprint === fingerprint) {
            localStorage.setItem(stateKey, JSON.stringify({ ...current, syncedDay: day, syncedRevision: pending.revision }));
          }
        });
      } finally {
        // A change made while the request was in flight must not wait until the next visit.
        const latest = JSON.stringify(readSnapshot());
        if (latest !== fingerprint) scheduleSync();
      }
    });
  } catch { /* Retain pending state and retry on the next visit, focus, or change. */ }
}

function scheduleSync() {
  clearTimeout(timer);
  timer = setTimeout(() => { void syncShopFavorites(); }, 600);
}

export function startShopFavoriteSync(): void {
  if (started) return;
  started = true;
  window.addEventListener('shop-favorites-changed', scheduleSync);
  window.addEventListener('storage', event => {
    if (event.key === favoriteStorageKeys.product || event.key === favoriteStorageKeys.site) {
      window.dispatchEvent(new Event('shop-favorites-changed'));
    }
  });
  window.addEventListener('online', scheduleSync);
  window.addEventListener('pageshow', scheduleSync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(); });
  scheduleSync();
}
