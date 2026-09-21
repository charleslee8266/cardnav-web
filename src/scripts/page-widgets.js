/*
文件说明: 承载公开站点轻量页面部件增强，供需要小交互的页面复用一个构建产物。
*/

function parseJsonScript(id, fallback = {}) {
  try {
    return JSON.parse(document.getElementById(id)?.textContent || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function localizedFallbackPath(pathname) {
  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const [, maybeLocale] = window.location.pathname.split('/');
  return ['en', 'ru'].includes(maybeLocale) ? `/${maybeLocale}${normalizedPathname}` : normalizedPathname;
}

function initSubmitDialogUrl(dialog, openButton, queryKey = 'submit-dialog') {
  if (!dialog) return;
  let closingFromUrl = false;
  const hasQuery = () => new URL(window.location.href).searchParams.has(queryKey);
  const updateQuery = (open, replace = false) => {
    const url = new URL(window.location.href);
    url.searchParams.delete(queryKey);
    if (open) url.searchParams.delete(queryKey === 'submit-dialog' ? 'support-dialog' : 'submit-dialog');
    const query = url.searchParams.toString();
    url.search = open ? `${query ? `?${query}&` : '?'}${queryKey}` : query;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
  };
  const show = (sourceElement = null) => {
    document.querySelectorAll('#shopSubmitDialog[open], #gatewaySubmitDialog[open], #supportDialog[open]').forEach(other => {
      if (other !== dialog) other.close();
    });
    if (!dialog.open) {
      dialog.showModal();
      if (queryKey === 'support-dialog') {
        dialog.dispatchEvent(new CustomEvent('support-open', {
          detail: { entry: sourceElement ? 'cta' : 'url', sourceElement: sourceElement || dialog },
        }));
      }
    }
  };
  const syncDialogToUrl = () => {
    if (hasQuery()) show();
    else if (dialog.open) {
      closingFromUrl = true;
      dialog.close();
      closingFromUrl = false;
    }
  };
  const openFromClick = event => {
    event.preventDefault();
    updateQuery(true);
    show(event.target instanceof Element ? event.target.closest('[data-open-support]') : null);
  };
  if (queryKey === 'support-dialog') {
    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-open-support], a[href="?support-dialog"]')) openFromClick(event);
    });
  } else openButton?.addEventListener('click', openFromClick);
  dialog.addEventListener('close', () => {
    if (!closingFromUrl && hasQuery()) updateQuery(false, true);
  });
  window.addEventListener('popstate', syncDialogToUrl);
  syncDialogToUrl();
}

function initHomeSearch() {
  const config = parseJsonScript('home-search-config');
  const shopsPath = config.shopsPath || localizedFallbackPath('/shops');
  const homeSearchForm = document.querySelector('[data-home-search-form]');
  homeSearchForm?.addEventListener('submit', () => {
    window.CardNavTelemetry?.track('form-submit', { form: 'home-search', 'target-page': shopsPath, url: shopsPath }, homeSearchForm);
  });
}

function initGuideBrowser() {
  const currentLink = document.querySelector('[data-guide-current="true"]');
  const disclosure = document.querySelector('.guide-sidebar-disclosure');
  if (!currentLink) return;
  currentLink.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  disclosure?.addEventListener('toggle', () => {
    if (!disclosure.open) return;
    requestAnimationFrame(() => {
      currentLink.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  });
}

function initHighlightTheme() {
  const link = document.getElementById('hljs-theme');
  if (!link) return;
  const lightUrl = link.getAttribute('data-light');
  const darkUrl = link.getAttribute('data-dark');

  function updateTheme() {
    const theme = document.documentElement.getAttribute('data-theme');
    link.setAttribute('href', theme === 'dark' ? darkUrl : lightUrl);
  }

  updateTheme();
  new MutationObserver(updateTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}

function initShopSubmit() {
  const messages = parseJsonScript('shops-messages');
  const submitMessages = messages.submit || {};
  const shopSubmitDialog = document.querySelector('#shopSubmitDialog');
  const openShopSubmitModalButton = document.querySelector('#openShopSubmitModal');
  const submitForm = document.querySelector('#submitForm');
  const urlInput = document.querySelector('#urlInput');
  const clientError = document.querySelector('#clientError');
  const submitError = document.querySelector('#submitError');
  const submitSuccess = document.querySelector('#submitSuccess');
  const submitButton = submitForm?.querySelector('button[type="submit"]');

  function hideServerMessages() {
    submitError?.classList.add('hidden');
    submitSuccess?.classList.add('hidden');
    if (submitError) submitError.textContent = '';
    if (submitSuccess) submitSuccess.textContent = '';
  }

  function showError(message) {
    submitSuccess?.classList.add('hidden');
    if (submitSuccess) submitSuccess.textContent = '';
    if (submitError) {
      submitError.textContent = message;
      submitError.classList.remove('hidden');
    }
  }

  function showSuccess(message) {
    submitError?.classList.add('hidden');
    if (submitError) submitError.textContent = '';
    if (submitSuccess) {
      submitSuccess.textContent = message;
      submitSuccess.classList.remove('hidden');
    }
  }

  initSubmitDialogUrl(shopSubmitDialog, openShopSubmitModalButton);
  shopSubmitDialog?.addEventListener('close', () => {
    urlInput.value = '';
    urlInput.disabled = false;
    if (submitButton) submitButton.disabled = false;
    clientError?.classList.add('hidden');
    hideServerMessages();
  });

  submitForm?.addEventListener('submit', event => {
    window.CardNavTelemetry?.track('form-submit', { form: 'shop-submit' }, submitForm);
    hideServerMessages();
    event.preventDefault();
    clientError?.classList.add('hidden');
    let submitted = false;
    if (submitButton) submitButton.disabled = true;

    fetch(submitForm.action, {
      method: 'POST',
      body: JSON.stringify({ url: urlInput.value.trim(), locale: shopSubmitDialog.dataset.locale }),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-requested-with': 'fetch',
      },
    })
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload || payload.ok !== true) {
          showError(payload && payload.message ? payload.message : submitMessages.failed);
          return;
        }
        submitted = true;
        urlInput.value = payload.url;
        urlInput.disabled = true;
        showSuccess(payload.message || submitMessages.success);
      })
      .catch(() => {
        showError(submitMessages.failed);
      })
      .finally(() => {
        if (submitButton && !submitted) submitButton.disabled = false;
      });
  });

  urlInput?.addEventListener('input', () => {
    clientError?.classList.add('hidden');
    hideServerMessages();
  });

}

function initGatewaySubmit() {
  const config = parseJsonScript('gateway-submit-messages');
  const messages = config.submit || {};
  const gatewayMessages = config.gateway || {};
  const dialog = document.querySelector('#gatewaySubmitDialog');
  const openButton = document.querySelector('#openGatewaySubmitModal');
  const form = document.querySelector('#gatewaySubmitForm');
  const url = document.querySelector('#gatewayUrlInput');
  const apiEndpoint = document.querySelector('#gatewayApiEndpointInput');
  const name = document.querySelector('#gatewayNameInput');
  const summary = document.querySelector('#gatewaySummaryInput');
  const paymentSelect = document.querySelector('#gatewayPaymentSelect');
  const paymentSummary = paymentSelect?.querySelector('summary');
  const paymentLabel = paymentSelect?.querySelector('[data-payment-selection-label]');
  const error = document.querySelector('#gatewaySubmitError');
  const success = document.querySelector('#gatewaySubmitSuccess');
  const button = form?.querySelector('button[type="submit"]');
  if (!form || !url || !name || !summary) return;
  const selectedPayments = new Set();
  const syncPaymentSelection = () => {
    const labels = [...paymentSelect?.querySelectorAll('.gateway-payment-option[aria-pressed="true"]') || []].map(option => option.dataset.paymentLabel || '');
    if (paymentLabel) {
      paymentLabel.textContent = labels.length ? labels.join(gatewayMessages.paymentMethodSeparator || ', ') : gatewayMessages.selectPaymentMethods;
      paymentLabel.classList.toggle('text-base-content/65', labels.length === 0);
    }
  };
  paymentSelect?.querySelectorAll('.gateway-payment-option').forEach(option => option.addEventListener('click', () => {
    const key = option.dataset.paymentKey;
    if (!key) return;
    if (selectedPayments.has(key)) selectedPayments.delete(key); else selectedPayments.add(key);
    const active = selectedPayments.has(key);
    option.setAttribute('aria-pressed', String(active));
    option.classList.toggle('bg-primary/10', active);
    option.querySelector('.gateway-payment-check')?.classList.toggle('hidden', !active);
    syncPaymentSelection();
  }));
  document.addEventListener('click', event => {
    if (paymentSelect?.open && event.target instanceof Node && !paymentSelect.contains(event.target)) {
      paymentSelect.removeAttribute('open');
    }
  });
  const show = (element, text) => { element.textContent = text; element.classList.remove('hidden'); };
  const clear = () => { error?.classList.add('hidden'); success?.classList.add('hidden'); };
  initSubmitDialogUrl(dialog, openButton);
  dialog?.addEventListener('close', () => {
    form.reset();
    selectedPayments.clear();
    paymentSelect?.querySelectorAll('.gateway-payment-option').forEach(option => {
      option.setAttribute('aria-pressed', 'false');
      option.classList.remove('bg-primary/10');
      option.querySelector('.gateway-payment-check')?.classList.add('hidden');
    });
    syncPaymentSelection();
    form.querySelectorAll('input, textarea, button.gateway-payment-option').forEach(control => { control.disabled = false; });
    paymentSelect?.classList.remove('pointer-events-none', 'opacity-75');
    paymentSummary?.classList.remove('bg-base-200', 'cursor-not-allowed');
    button?.removeAttribute('disabled');
    clear();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); clear();
    if (!url.value.trim()) { show(error, messages.invalidUrl || messages.failed); url.focus(); return; }
    if (!name.value.trim()) { show(error, messages.invalidGatewayName || messages.failed); name.focus(); return; }
    if (name.value.trim().length > 20) { show(error, messages.gatewayNameTooLong || messages.failed); name.focus(); return; }
    if (summary.value.trim().length > 150) { show(error, messages.gatewaySummaryTooLong || messages.failed); summary.focus(); return; }
    window.CardNavTelemetry?.track('form-submit', { form: 'gateway-submit' }, form);
    button?.setAttribute('disabled', 'disabled');
    let submitted = false;
    try {
      const response = await fetch(form.action, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'x-requested-with': 'fetch' }, body: JSON.stringify({ locale: config.locale, url: url.value.trim(), apiEndpoint: apiEndpoint?.value.trim() || '', name: name.value.trim(), summary: summary.value.trim(), paymentMethods: [...selectedPayments] }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) { show(error, payload?.message || messages.failed); return; }
      submitted = true;
      form.querySelectorAll('input, textarea, button.gateway-payment-option').forEach(control => { control.disabled = true; });
      paymentSelect?.classList.add('pointer-events-none', 'opacity-75');
      paymentSummary?.classList.add('bg-base-200', 'cursor-not-allowed');
      paymentSelect?.removeAttribute('open');
      show(success, payload.message || messages.success);
    } catch { show(error, messages.failed); } finally { if (!submitted) button?.removeAttribute('disabled'); }
  });
}

function initModelLeaderboard() {
  function textCell(className, value) {
    const cell = document.createElement('td');
    cell.className = className;
    cell.textContent = String(value);
    return cell;
  }

  function rowElement(item) {
    const row = document.createElement('tr');
    row.className = 'hover';
    const rank = Number(item.rank);
    const score = Number(item.score);
    if (Number.isFinite(rank)) row.dataset.sortSequence = String(rank);
    const sequenceCell = textCell('data-table-sequence-cell', Number.isFinite(rank) ? rank : '');
    sequenceCell.setAttribute('data-table-sequence-cell', '');
    row.append(
      sequenceCell,
      textCell('font-semibold text-base-content break-all', item.modelName ?? ''),
      textCell('font-mono font-bold text-primary', Number.isFinite(score) ? score.toFixed(2) : '-'),
    );
    return row;
  }

  function updateSummary(summary, renderedCount, totalCount) {
    if (!(summary instanceof HTMLElement)) return;
    const template = summary.dataset.summaryTemplate || 'Showing {rendered} / {total}';
    summary.textContent = template
      .replace('{rendered}', String(renderedCount))
      .replace('{total}', String(totalCount));
  }

  document.querySelectorAll('[data-model-leaderboard]').forEach(leaderboard => {
    const button = leaderboard.querySelector('[data-model-leaderboard-load-more]');
    const body = leaderboard.querySelector('[data-model-leaderboard-body]');
    const summary = leaderboard.querySelector('[data-model-leaderboard-load-summary]');
    const apiUrl = leaderboard.getAttribute('data-model-leaderboard-api');
    if (!button || !body || !apiUrl) return;

    if (typeof window.createDeferredTableController === 'function') {
      const controller = window.createDeferredTableController({
        table: leaderboard.querySelector('table'),
        tbody: body,
        button,
        summary,
        pageSize: 30,
        totalCount: Number(leaderboard.getAttribute('data-model-leaderboard-total')) || 0,
        apiUrl,
        summaryTemplate: summary?.dataset.summaryTemplate || 'Showing {rendered} / {total}',
        entryFromRow: (row, index) => ({ index, row, item: null, sort: { sequence: Number(row.dataset.sortSequence) || index + 1 } }),
        entryFromItem: (item, index) => ({ index, row: null, item, sort: { sequence: Number(item.rank) || index + 1 } }),
        ensureRow: entry => {
          if (!entry.row) entry.row = rowElement(entry.item);
          entry.row.classList.remove('hidden');
          return entry.row;
        },
        getItems: payload => (Array.isArray(payload.rows) ? payload.rows : []),
      });
      controller.initialize();
      button.addEventListener('click', async () => {
        try {
          await controller.loadMore();
          window.CardNavTelemetry?.track('button-click', { scope: 'model-leaderboard', action: 'load-more' }, leaderboard);
        } catch {
          button.removeAttribute('disabled');
        }
      });
      return;
    }

    button.addEventListener('click', async () => {
      button.setAttribute('disabled', 'disabled');
      try {
        const response = await fetch(apiUrl, {
          headers: { accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        if (rows.length) body.append(...rows.map(rowElement));
        const loadedRows = body.querySelectorAll('tr.hover').length;
        const totalCount = Number(payload.totalCount) || loadedRows;
        updateSummary(summary, loadedRows, totalCount);
        button.classList.add('hidden');
        window.CardNavTelemetry?.track('button-click', { scope: 'model-leaderboard', action: 'load-more' }, leaderboard);
      } catch {
        button.removeAttribute('disabled');
      }
    }, { once: true });
  });
}

initHomeSearch();
initGuideBrowser();
initHighlightTheme();
initShopSubmit();
initGatewaySubmit();
initModelLeaderboard();

initSubmitDialogUrl(document.querySelector('#supportDialog'), document.querySelector('[data-open-support]'), 'support-dialog');
