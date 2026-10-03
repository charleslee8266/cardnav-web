/** Extend an explicit primary link to its row without replacing nested controls. */
(() => {
  const rows = '.data-table tbody tr, .merchant-row';
  const interactive = 'a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [contenteditable], [popover], [data-inline-help], [data-row-navigation-ignore]';
  let press;
  document.addEventListener('pointerdown', event => { press = { x: event.clientX, y: event.clientY }; }, true);
  const navigate = event => {
    if (event.defaultPrevented || (event.type === 'click' ? event.button !== 0 : event.button !== 1)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(interactive) || window.getSelection()?.toString()) return;
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) return;
    const row = target.closest(rows);
    const link = row?.querySelector('a[data-row-primary][href]');
    if (!(link instanceof HTMLAnchorElement)) return;
    event.preventDefault();
    // The real anchor retains navigation, tracking, target, and modifier semantics.
    // Its synthetic event terminates at the interactive guard above, never recursing.
    link.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, view: window, button: 0,
      ctrlKey: event.ctrlKey || event.button === 1, metaKey: event.metaKey,
      shiftKey: event.shiftKey, altKey: event.altKey,
    }));
  };
  document.addEventListener('click', navigate);
  document.addEventListener('auxclick', navigate);
})();
