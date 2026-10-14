function useSponsorImageFallback(image) {
  if (!(image instanceof HTMLImageElement) || !image.hasAttribute('data-sponsor-image')) return;
  image.closest('.sponsor-logo-frame')?.classList.add('sponsor-image-failed');
}
// Capture also handles images inserted by subsequent fragment refreshes.
document.addEventListener('error', event => useSponsorImageFallback(event.target), true);
function checkSponsorImages(container) {
  for (const image of container.querySelectorAll('[data-sponsor-image]')) {
    if (image.complete && image.naturalWidth === 0) useSponsorImageFallback(image);
  }
}
checkSponsorImages(document);

/** SSR supplies the first paint; later refreshes keep an open page current. */
const requests = new Map();
function requestFragment(url) {
  if (!requests.has(url)) {
    requests.set(url, fetch(url, { signal: AbortSignal.timeout(10_000) }).then(async response => {
      if (!response.ok) throw new Error(`Sponsor request failed: ${response.status}`);
      return response.text();
    }).finally(() => requests.delete(url)));
  }
  return requests.get(url);
}

for (const container of document.querySelectorAll('[data-sponsor-fragment]')) {
  let timer;
  let inFlight = false;
  async function refresh() {
    clearTimeout(timer);
    if (inFlight) return;
    inFlight = true;
    try {
      container.innerHTML = await requestFragment(container.dataset.sponsorFragment);
      container.hidden = !container.querySelector('section');
      checkSponsorImages(container);
    } catch (error) {
      console.error('Unable to load sponsors', error);
    } finally {
      inFlight = false;
      if (!document.hidden) timer = setTimeout(refresh, 60_000);
    }
  }
  if (container.hasAttribute('data-sponsor-deferred')) void refresh();
  else if (!document.hidden) timer = setTimeout(refresh, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else void refresh();
  });
  window.addEventListener('pagehide', () => clearTimeout(timer));
  window.addEventListener('pageshow', event => { if (event.persisted) void refresh(); });
}
