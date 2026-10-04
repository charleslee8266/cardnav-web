/* Run synchronously in head: announcement visibility must be decided before the body paints. */
(() => {
  const announcements = JSON.parse(document.currentScript.dataset.announcements || '[]');
  const root = document.documentElement;
  const now = Date.now();
  const key = id => `cardnav-announcement-${id}-dismissed-at`;
  const pending = announcements.map((announcement, index) => {
    let dismissedAt = null;
    try {
      const stored = localStorage.getItem(key(announcement.id));
      if (stored !== null && Number.isFinite(Number(stored))) dismissedAt = Number(stored);
    } catch { /* Storage restrictions do not prevent reading or closing an announcement. */ }
    return dismissedAt === null || (announcement.repeatAfterHours > 0 && now - dismissedAt >= announcement.repeatAfterHours * 3600000) ? index : -1;
  }).filter(index => index >= 0);
  const showNext = () => announcements.forEach((_, index) => {
    root.style.setProperty(`--announcement-${index}-display`, pending[0] === index ? 'block' : 'none');
  });
  showNext();
  root.style.setProperty('--announcement-close-display', 'grid');
  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('[data-dismiss-announcement]') : null;
    if (!button) return;
    const announcement = announcements[pending[0]];
    if (!announcement || button.closest('[data-announcement-id]')?.dataset.announcementId !== announcement.id) return;
    window.CardNavTelemetry?.track('button-click', { scope: 'site', action: 'dismiss-announcement' }, button);
    pending.shift();
    showNext();
    try { localStorage.setItem(key(announcement.id), String(Date.now())); } catch { /* Closing still applies to this page. */ }
  });
})();
