import { createDeferredTableController } from './deferred-table-core.js';
import { bindFamilySelection, createModelFamilySelection } from '../models/family-selection.js';
import { gatewayProviderSlug } from '../models/routes.js';
import { renderFilterSummary } from './filter-summary.js';
import { matchesLeaderboardHighlight, leaderboardHighlightPath } from '../models/leaderboard-highlight.js';
import { createRelatedLink } from '../models/related-link.js';
import { createProviderLabel } from '../data-display.js';
import { getModelFamilyIcon } from '../models/family-icons.js';
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

function initHomeSearch() {
  const config = parseJsonScript('home-search-config');
  const shopsPath = config.shopsPath || localizedFallbackPath('/shops');
  const homeSearchForm = document.querySelector('[data-home-search-form]');
  homeSearchForm?.addEventListener('submit', () => {
    window.CardNavTelemetry?.track('form-submit', { form: 'home-search', 'target-page': shopsPath, url: shopsPath }, homeSearchForm);
  });
}

function initGuideBrowser() {
  const disclosure = document.querySelector('.reading-tree-disclosure');
  if (!disclosure) return;
  const desktop = window.matchMedia('(min-width: 1025px)');
  const sync = () => { disclosure.open = desktop.matches; };
  sync();
  desktop.addEventListener('change', sync);
  disclosure.addEventListener('toggle', () => {
    if (desktop.matches && !disclosure.open) disclosure.open = true;
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

function initModelLeaderboard() {
  function textCell(className, value) {
    const cell = document.createElement('td');
    cell.className = className;
    cell.textContent = String(value);
    return cell;
  }

  function rowElement(item, maximumScore, labels) {
    const row = document.createElement('tr');
    const current = new URL(window.location.href);
    row.className = `hover${matchesLeaderboardHighlight(item, current.searchParams.getAll('family'), current.searchParams.get('q') || '', current.searchParams.getAll('provider')) ? ' leaderboard-row-highlight' : ''}`;
    row.dataset.modelFamily = item.modelFamily || '';
    row.dataset.sortFamily = item.modelFamily || '';
    const rank = Number(item.rank);
    const score = Number(item.score);
    if (Number.isFinite(rank)) row.dataset.sortSequence = String(rank);
    row.dataset.sortModel = item.modelName ?? '';
    row.dataset.sortProvider = item.modelOrganization ?? '';
    row.dataset.sortScore = String(score);
    const sequenceCell = textCell('data-table-sequence-cell', Number.isFinite(rank) ? rank : '');
    sequenceCell.setAttribute('data-table-sequence-cell', '');
    const scoreCell = textCell('data-table-cell-align-right', '');
    const scoreDisplay = document.createElement('span');
    scoreDisplay.className = 'data-score';
    scoreDisplay.title = String(score);
    scoreDisplay.textContent = Number.isFinite(score) ? score.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—';
    const meter = document.createElement('span');
    meter.className = 'data-score-meter';
    meter.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('i');
    fill.style.setProperty('--score-fill', `${Math.max(0, Math.min(100, score / Math.max(1, maximumScore) * 100))}%`);
    meter.append(fill); scoreDisplay.append(meter); scoreCell.append(scoreDisplay);
    const modelCell = textCell('', '');
    const modelName = document.createElement('strong');
    modelName.className = 'leaderboard-model-name';
    const asset = getModelFamilyIcon(item.modelFamily ?? '');
    const icon = document.createElement('img');
    icon.src = asset.path; icon.alt = ''; icon.width = 16; icon.height = 16;
    if (asset.monochrome) icon.className = 'data-provider-mono';
    const nameText = document.createElement('span');
    nameText.textContent = item.modelName ?? '';
    nameText.title = item.modelName ?? '';
    modelName.append(icon, nameText);
    modelCell.append(modelName);
    const providerCell = textCell('', item.modelOrganization ? '' : '—');
    if (item.modelOrganization) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'leaderboard-provider-select';
      button.dataset.leaderboardProvider = gatewayProviderSlug(item.modelOrganization);
      button.append(createProviderLabel(item.modelOrganization)); providerCell.append(button);
    }
    const familyCell = textCell('', item.modelFamily ? '' : '—');
    if (item.modelFamily) familyCell.append(createModelFamilySelection(item.modelFamily, 'leaderboard'));
    const familyLinkCell = (path, label) => {
      const cell = textCell('', '');
      if (path) {
        const link = createRelatedLink({ href: path, label: `${item.modelFamily || ''} ${label}` });
        cell.append(link);
      } else {
        const empty = document.createElement('span');
        empty.className = 'leaderboard-no-link'; empty.textContent = '—';
        cell.append(empty);
      }
      return cell;
    };
    row.append(sequenceCell, modelCell, scoreCell, familyCell, providerCell, familyLinkCell(item.gatewayPath, labels.gateway), familyLinkCell(item.shopPath, labels.shop));
    return row;
  }

  document.querySelectorAll('[data-model-leaderboard]').forEach(leaderboard => {
    const form = leaderboard.querySelector('[data-leaderboard-highlight-form]');
    const queryInput = form?.querySelector('[name="q"]');
    const familyInputs = [...(form?.querySelectorAll('[data-multi-filter=family] [data-filter-value]') || [])];
    const providerInputs = [...(form?.querySelectorAll('[data-multi-filter=provider] [data-filter-value]') || [])];
    const allInputs = [...familyInputs, ...providerInputs];
    const initialUrl = new URL(window.location.href);
    familyInputs.forEach(input => { input.checked = initialUrl.searchParams.getAll('family').includes(input.value); });
    providerInputs.forEach(input => { input.checked = initialUrl.searchParams.getAll('provider').includes(input.value); });
    const syncHighlight = () => {
      const families = familyInputs.filter(input => input.checked).map(input => input.value);
      const providers = providerInputs.filter(input => input.checked).map(input => input.value);
      const query = queryInput?.value || '';
      history.replaceState(null, '', leaderboardHighlightPath(window.location.href, families, query, providers));
      leaderboard.querySelectorAll('[data-sort-model]').forEach(row => {
        row.classList.toggle('leaderboard-row-highlight', matchesLeaderboardHighlight({modelName: row.dataset.sortModel || '', modelFamily: row.dataset.modelFamily || null, modelOrganization: row.dataset.sortProvider || null}, families, query, providers));
      });
      leaderboard.querySelectorAll('[role="tab"]').forEach(tab => { tab.href = leaderboardHighlightPath(new URL(tab.href).pathname, families, query, providers); });
      for (const inputs of [familyInputs, providerInputs]) {
        const summary = inputs[0]?.closest('[data-multi-filter]')?.querySelector('[data-multi-summary]');
        const chosen = inputs.filter(input => input.checked);
        if (summary) summary.textContent = chosen.length ? chosen.map(input => input.closest('label').textContent.trim()).join('、') : summary.dataset.emptyLabel;
      }
      renderFilterSummary(leaderboard.querySelector('[data-leaderboard-active-filters]'), allInputs.map(input => ({
        input, label: () => input.closest('label').textContent.trim(),
      })), { countElement: form?.querySelector('[data-filter-count]'), onChange: syncHighlight });
      const related = leaderboard.querySelector('[data-leaderboard-related]');
      if (related) {
        const options = JSON.parse(related.dataset.options || '[]');
        const chosen = options.filter(option => families.includes(option.id));
        related.replaceChildren();
        const first = chosen[0];
        if (first) for (const [path, label] of [['gatewayPath', 'gatewayLabel'], ['shopPath', 'shopLabel'], ['officialPath', 'officialLabel']]) {
          if (first[path]) related.append(createRelatedLink({href: `${related.dataset.localePrefix || ''}${first[path]}`, label: related.dataset[label].replace('{term}', first.name)}));
        }
      }
    };
    form?.addEventListener('submit', event => { event.preventDefault(); syncHighlight(); });
    queryInput?.addEventListener('input', syncHighlight);
    allInputs.forEach(input => input.addEventListener('change', syncHighlight));
    bindFamilySelection('leaderboard', family => { const input = familyInputs.find(input => input.value === family); if (input) { input.checked = true; syncHighlight(); } });
    leaderboard.addEventListener('click', event => { const button = event.target.closest('[data-leaderboard-provider]'); if (!button) return; const input = providerInputs.find(input => input.value === button.dataset.leaderboardProvider); if (input) { input.checked = true; syncHighlight(); } });
    form?.querySelector('#leaderboardFilters')?.addEventListener('filter-clear', () => { allInputs.forEach(input => { input.checked = false; }); syncHighlight(); });
    syncHighlight();
    const button = leaderboard.querySelector('[data-model-leaderboard-load-more]');
    const body = leaderboard.querySelector('[data-model-leaderboard-body]');
    const summary = leaderboard.querySelector('[data-model-leaderboard-load-summary]');
    const apiUrl = leaderboard.getAttribute('data-model-leaderboard-api');
    const maximumScore = Number(leaderboard.dataset.scoreMax) || 100;
    if (!button || !body || !apiUrl) return;

    const controller = createDeferredTableController({
      table: leaderboard.querySelector('table'),
      tbody: body,
      button,
      summary,
      pageSize: 30,
      totalCount: Number(leaderboard.getAttribute('data-model-leaderboard-total')) || 0,
      apiUrl,
      summaryTemplate: summary?.dataset.summaryTemplate || 'Showing {rendered} / {total}',
      entryFromRow: (row, index) => ({ index, row, item: null, sort: { sequence: Number(row.dataset.sortSequence) || index + 1, model: row.dataset.sortModel, family: row.dataset.modelFamily, provider: row.dataset.sortProvider, score: Number(row.dataset.sortScore) } }),
      entryFromItem: (item, index) => ({ index, row: null, item, sort: { sequence: Number(item.rank) || index + 1, model: item.modelName, family: item.modelFamily, provider: item.modelOrganization, score: Number(item.score) } }),
      ensureRow: entry => {
        if (!entry.row) entry.row = rowElement(entry.item, maximumScore, { gateway: leaderboard.dataset.gatewayLinkLabel, shop: leaderboard.dataset.shopLinkLabel });
        entry.row.classList.remove('hidden');
        const current = new URL(window.location.href);
        entry.row.classList.toggle('leaderboard-row-highlight', matchesLeaderboardHighlight({modelName: entry.row.dataset.sortModel || '', modelFamily: entry.row.dataset.modelFamily || null, modelOrganization: entry.row.dataset.sortProvider || null}, current.searchParams.getAll('family'), current.searchParams.get('q') || '', current.searchParams.getAll('provider')));
        return entry.row;
      },
      getItems: payload => payload.rows,
    });
    controller.initialize();
    leaderboard.querySelector('table').addEventListener('click', async event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('[data-inline-help]')) return;
      const sortButton = target.closest('.data-table-sort-button') || target.closest('th')?.querySelector('.data-table-sort-button');
      if (!sortButton) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        await controller.sortFromButton(sortButton);
        window.CardNavTelemetry?.track('sort-change', { scope: 'model-leaderboard', key: sortButton.dataset.sortKey, direction: sortButton.dataset.sortDirection || 'none' }, leaderboard);
      } catch {
        button.removeAttribute('disabled');
      }
    }, { capture: true });
    button.addEventListener('click', async () => {
      try {
        await controller.loadMore();
        window.CardNavTelemetry?.track('button-click', { scope: 'model-leaderboard', action: 'load-more' }, leaderboard);
      } catch {
        button.removeAttribute('disabled');
      }
    });

  });
}

initHomeSearch();
initGuideBrowser();
initHighlightTheme();
initModelLeaderboard();
