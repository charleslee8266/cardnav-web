const busyScopes = new WeakMap();

/** Request feedback stays inside its list while existing results remain usable. */
export function createListLoading(root) {
  const busyScope = root.closest('.data-workspace') || root;
  let pending = 0;
  let timer;
  let failed = false;
  const status = document.createElement('div');
  status.className = 'data-list-feedback data-table-loading';
  status.hidden = true;
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const message = document.createElement('span');
  message.className = 'data-list-feedback-message';
  status.append(message);
  root.prepend(status);

  return {
    async run(task, { anchor = null } = {}) {
      if (pending++ === 0) {
        failed = false;
        const hasRows = Boolean(root.querySelector('tbody tr:not(.hidden), [data-filter-visible="1"]:not(.hidden)'));
        status.dataset.empty = String(!hasRows);
        if (!hasRows) anchor = null;
        status.dataset.placement = anchor ? 'bottom' : 'list';
        if (anchor) anchor.before(status);
        else if (!hasRows && root.querySelector('table')) root.querySelector('table').after(status);
        else root.prepend(status);
        status.hidden = true;
        status.dataset.state = 'loading';
        message.textContent = document.body.dataset.listLoading || 'Loading…';
        root.setAttribute('aria-busy', 'true');
        busyScopes.set(busyScope, (busyScopes.get(busyScope) || 0) + 1);
        busyScope.dataset.listLoading = 'true';
        root.dataset.listLoadState = 'loading';
        if (anchor || !hasRows) status.hidden = false;
        else timer = setTimeout(() => { status.hidden = false; }, 350);
      }
      try {
        return await task();
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        if (--pending === 0) {
          clearTimeout(timer);
          root.removeAttribute('aria-busy');
          const remaining = (busyScopes.get(busyScope) || 1) - 1;
          if (remaining) busyScopes.set(busyScope, remaining);
          else {
            busyScopes.delete(busyScope);
            delete busyScope.dataset.listLoading;
          }
          root.dataset.listLoadState = failed ? 'error' : '';
          status.dataset.state = failed ? 'error' : '';
          message.textContent = failed ? (document.body.dataset.listLoadError || 'Could not load. Please try again.') : '';
          status.hidden = !failed;
        }
      }
    },
  };
}
