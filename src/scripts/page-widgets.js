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

function initHomeSearch() {
  const config = parseJsonScript('home-search-config');
  const shopsPath = config.shopsPath || '/shops';
  const homeSearchForm = document.querySelector('[data-home-search-form]');
  const homeSearchInput = homeSearchForm?.querySelector('[data-home-search-input]');
  const homeSearchButton = homeSearchForm?.querySelector('[data-umami-event="home-search-submit"]');

  function syncHomeSearchEvent() {
    if (!homeSearchButton || !homeSearchInput) return;
    const query = homeSearchInput.value.trim();
    const targetPage = query ? `${shopsPath}?q=${encodeURIComponent(query)}` : shopsPath;
    homeSearchButton.dataset.umamiEventQuery = query;
    homeSearchButton.dataset.umamiEventUrl = targetPage;
    homeSearchButton.dataset.umamiEventTargetPage = targetPage;
  }

  homeSearchInput?.addEventListener('input', syncHomeSearchEvent);
  homeSearchForm?.addEventListener('submit', syncHomeSearchEvent);
  syncHomeSearchEvent();
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

  function syncSubmitEventUrl() {
    if (submitButton) submitButton.dataset.umamiEventUrl = urlInput?.value.trim() || '';
  }

  const temporaryUrlPattern = /^https?:\/\/(?:[^/?#]+\.)*(?:webhook\.site|serveousercontent\.com|lhr\.life|loca\.lt)(?::\d+)?(?:[/?#]|$)/i;
  const productItemUrlPattern = /^https?:\/\/(?:pay\.ldxp\.cn|catfk\.com)(?::\d+)?\/(?:item\/[^/?#]+|shop\/[^/?#]+\/[^?#]+)/i;
  const trackedShopUrlPattern = /^https?:\/\/(?:pay\.ldxp\.cn|catfk\.com)(?::\d+)?\/shop\/[^/?#]+(?:[?#]|$)/i;
  const ipAddressUrlPattern = /^https?:\/\/(?:\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:.]+\])(?::\d+)?(?:[/?#]|$)/i;
  const incompleteDomainUrlPattern = /^https?:\/\/[^/?#.[\]:]+(?::\d+)?(?:[/?#]|$)/i;
  const platformHomeUrlPattern = /^https?:\/\/(?:pay\.ldxp\.cn|catfk\.com)(?::\d+)?\/?(?:[?#]|$)/i;
  const reservedHostUrlPattern = /^https?:\/\/(?:localhost|[^/?#]+\.(?:local|internal|invalid))(?::\d+)?(?:[/?#]|$)/i;
  const probeUrlPattern = /^https?:\/\/(?:(?:[^/?#:]+\.)?example\.[^/?#:]+(?::\d+)?\/[^?#]*(?:ctf|probe|admin|test|'|%27|%20or%20|--)|httpbin\.org(?::\d+)?\/base64\/|(?:(?:www|staging)\.)?cardnav\.xyz(?::\d+)?\/(?:admin|api)(?:[/?#]|$))/i;

  function submitUrlRejectReason(value) {
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'invalidUrl';
      url.hash = '';
      const normalized = url.toString().replace(/\/$/, '');
      if (ipAddressUrlPattern.test(normalized)) return 'ipAddressUrl';
      if (incompleteDomainUrlPattern.test(normalized)) return 'invalidDomainUrl';
      if (temporaryUrlPattern.test(normalized)) return 'temporaryUrl';
      if (productItemUrlPattern.test(normalized)) return 'productItemUrl';
      if (platformHomeUrlPattern.test(normalized)) return 'platformHomeUrl';
      if (reservedHostUrlPattern.test(normalized)) return 'reservedHostUrl';
      if (probeUrlPattern.test(normalized)) return 'probeUrl';
      return '';
    } catch {
      return 'invalidUrl';
    }
  }

  function normalizeSubmittedUrl(value) {
    const url = new URL(value.trim());
    url.hash = '';
    const normalized = url.toString().replace(/\/$/, '');
    if (trackedShopUrlPattern.test(normalized)) url.search = '';
    return url.toString().replace(/\/$/, '');
  }

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

  openShopSubmitModalButton?.addEventListener('click', () => {
    shopSubmitDialog?.showModal();
    syncSubmitEventUrl();
  });

  submitForm?.addEventListener('submit', event => {
    syncSubmitEventUrl();
    hideServerMessages();
    const rejectReason = submitUrlRejectReason(urlInput?.value || '');
    if (rejectReason) {
      event.preventDefault();
      if (clientError) clientError.textContent = submitMessages[rejectReason] || submitMessages.invalidUrl;
      clientError?.classList.remove('hidden');
      urlInput?.focus();
      return;
    }

    event.preventDefault();
    clientError?.classList.add('hidden');
    if (submitButton) submitButton.disabled = true;

    fetch(submitForm.action, {
      method: 'POST',
      body: JSON.stringify({ url: normalizeSubmittedUrl(urlInput.value) }),
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
        urlInput.value = '';
        syncSubmitEventUrl();
        showSuccess(payload.message || submitMessages.success);
      })
      .catch(() => {
        showError(submitMessages.failed);
      })
      .finally(() => {
        if (submitButton) submitButton.disabled = false;
      });
  });

  urlInput?.addEventListener('input', () => {
    syncSubmitEventUrl();
    clientError?.classList.add('hidden');
    hideServerMessages();
  });

  syncSubmitEventUrl();
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
    row.append(
      textCell('font-bold', Number.isFinite(rank) && rank <= 3 ? `#${rank}` : rank),
      textCell('font-semibold text-base-content break-all', item.modelName ?? ''),
      textCell('font-mono font-bold text-primary', Number.isFinite(score) ? score.toFixed(2) : '-'),
    );
    return row;
  }

  document.querySelectorAll('[data-model-leaderboard]').forEach(leaderboard => {
    const button = leaderboard.querySelector('[data-model-leaderboard-load-more]');
    const body = leaderboard.querySelector('[data-model-leaderboard-body]');
    const apiUrl = leaderboard.getAttribute('data-model-leaderboard-api');
    if (!button || !body || !apiUrl) return;

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
        button.closest('div')?.remove();
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
initModelLeaderboard();
