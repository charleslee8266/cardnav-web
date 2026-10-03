import { updateRefreshTime } from '../refresh-time.js';

function update(root: ParentNode = document) {
  const now = Date.now();
  if (root instanceof HTMLTimeElement && root.hasAttribute('data-refresh-time')) updateRefreshTime(root, now);
  root.querySelectorAll<HTMLTimeElement>('time[data-refresh-time]').forEach(time => updateRefreshTime(time, now));
}
update();
// Deferred tables and later page fragments use the same marker as server-rendered times.
new MutationObserver(records => {
  for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) update(node);
}).observe(document.body, { childList: true, subtree: true });
window.setInterval(() => update(), 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
