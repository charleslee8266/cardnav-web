import { searchGuides, type GuideSearchEntry } from '../guide-search.js';
for (const root of document.querySelectorAll<HTMLElement>('[data-guide-search]')) {
  const dialog = root.querySelector<HTMLDialogElement>('dialog')!;
  const input = root.querySelector<HTMLInputElement>('input')!;
  const status = root.querySelector<HTMLElement>('[role="status"]')!;
  const results = root.querySelector<HTMLUListElement>('ul')!;
  const retry = root.querySelector<HTMLButtonElement>('[data-search-retry]')!;
  const labels: Record<string, string> = JSON.parse(root.dataset.labels!);
  let entries: GuideSearchEntry[] | undefined;
  let tutorials: GuideSearchEntry[] | undefined;
  let loading = false;
  let requestId = 0;
  const render = () => {
    results.replaceChildren();
    if (!entries) return;
    const matches = searchGuides(entries, input.value);
    status.textContent = input.value.trim() ? (matches.length ? labels.results.replace('{count}', String(matches.length)) : labels.empty) : labels.hint;
    for (const result of matches.slice(0, 40)) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = result.entry.url;
      const title = document.createElement('strong'); title.textContent = result.entry.title;
      const kind = document.createElement('small'); kind.textContent = result.entry.kind === 'article' ? labels.article : labels.gettingStarted;
      const snippet = document.createElement('p'); snippet.textContent = result.snippet;
      link.append(title, kind, snippet); item.append(link); results.append(item);
    }
  };
  const load = async () => {
    if (loading) return;
    loading = true; entries = undefined; results.replaceChildren();
    const currentRequest = ++requestId;
    status.textContent = labels.loading; retry.hidden = true;
    try {
      const fetchIndex = async (url: string): Promise<GuideSearchEntry[]> => {
        const response = await fetch(url, {signal: AbortSignal.timeout(15000)});
        if (!response.ok) throw new Error('Index unavailable');
        return response.json();
      };
      const [guideEntries, articleEntries] = await Promise.all([
        tutorials ? Promise.resolve(tutorials) : fetchIndex('/guide-search.json'),
        fetchIndex('/api/article-search.json'),
      ]);
      if (currentRequest !== requestId) return;
      tutorials = guideEntries;
      entries = [...guideEntries.filter(entry => entry.locale === root.dataset.locale), ...articleEntries];
      render();
    } catch {
      status.textContent = labels.error; retry.hidden = false;
    } finally { loading = false; }
  };
  root.querySelector('[data-search-open]')!.addEventListener('click', () => {
    dialog.showModal(); input.focus(); void load();
  });
  root.querySelector('[data-search-close]')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const box=dialog.getBoundingClientRect(); if(event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom) dialog.close(); } });
  input.addEventListener('input', render);
  retry.addEventListener('click', () => void load());
}
