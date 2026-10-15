/** One URL state controls the shared dialogs on every public page. */
export function initDialogNavigation() {
  const dialogs = new Map([
    ['shop-submit', document.querySelector('#shopSubmitDialog')],
    ['gateway-submit', document.querySelector('#gatewaySubmitDialog')],
    ['support', document.querySelector('#supportDialog')],
  ]);
  const currentKind = () => new URL(window.location.href).searchParams.get('dialog');
  const sync = (sourceElement = null) => {
    const kind = currentKind();
    const selected = dialogs.get(kind);
    for (const dialog of dialogs.values()) {
      if (dialog?.open && dialog !== selected) dialog.close();
    }
    if (!selected || selected.open) return;
    document.querySelector('#site-navigation-dialog[open]')?.close();
    selected.showModal();
    if (kind === 'support') selected.dispatchEvent(new CustomEvent('support-open', {
      detail: { entry: sourceElement ? 'cta' : 'url', sourceElement: sourceElement || selected },
    }));
  };
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target.closest('[data-open-dialog], a[href]') : null;
    if (!target || target.hasAttribute('download') || (target.getAttribute('target') && target.getAttribute('target') !== '_self')) return;
    const link = target.hasAttribute('href') ? new URL(target.getAttribute('href'), window.location.href) : null;
    if (link && link.origin !== window.location.origin) return;
    const kind = target.dataset.openDialog || link?.searchParams.get('dialog');
    if (!dialogs.get(kind)) return;
    event.preventDefault();
    const url = new URL(window.location.href);
    url.searchParams.set('dialog', kind);
    if (kind !== 'support') url.searchParams.delete('support-kind');
    else if (link?.searchParams.has('support-kind')) url.searchParams.set('support-kind', link.searchParams.get('support-kind'));
    if (url.href !== window.location.href) window.history.pushState(null, '', url);
    target.closest('details[open]')?.removeAttribute('open');
    sync(target);
  });
  for (const [kind, dialog] of dialogs) {
    dialog?.addEventListener('close', () => {
      // The close event is queued: a different dialog may already own the URL.
      if (dialog.open || currentKind() !== kind) return;
      const url = new URL(window.location.href);
      url.searchParams.delete('dialog');
      if (kind === 'support') url.searchParams.delete('support-kind');
      window.history.replaceState(null, '', url);
    });
  }
  window.addEventListener('popstate', () => sync());
  sync();
}
