/*
文件说明: 在浏览器本地解析 ChatGPT/Codex 相关认证 JSON，并转换为多种导入格式。
*/
(() => {
  const formatNames = {
    Sub2API: 'Sub2API',
    cpa: 'CPA',
    cockpit: 'Cockpit',
    '9Router': '9Router',
    codex: 'Codex',
    axonhub: 'AxonHub',
    codexmanager: 'Codex-Manager',
  };

  const axonHubMissingRefreshToken = '__missing_refresh_token__';
  const state = {
    format: 'Sub2API',
    accounts: [],
    rejected: [],
    outputText: '',
  };

  const ui = {
    accountRows: document.querySelector('#sessionAccountRows'),
    clearInput: document.querySelector('#sessionClearInput'),
    copyOutput: document.querySelector('#sessionCopyOutput'),
    downloadOutput: document.querySelector('#sessionDownloadOutput'),
    fileInput: document.querySelector('#sessionFileInput'),
    formatSelect: document.querySelector('#sessionFormatSelect'),
    input: document.querySelector('#sessionInput'),
    issues: document.querySelector('#sessionIssues'),
    loadExample: document.querySelector('#sessionLoadExample'),
    output: document.querySelector('#sessionOutput'),
    outputStatus: document.querySelector('#sessionOutputStatus'),
    outputSubtitle: document.querySelector('#sessionOutputSubtitle'),
    pickFiles: document.querySelector('#sessionPickFiles'),
    statCount: document.querySelector('#sessionStatCount'),
    statErrors: document.querySelector('#sessionStatErrors'),
    tokenNotice: document.querySelector('#sessionTokenNotice'),
  };

  const sampleSession = {
    user: {
      id: 'user-example',
      email: 'mark@example.com',
    },
    expires: '2026-08-06T14:29:36.155Z',
    account: {
      id: '00000000-0000-4000-9000-000000000000',
      planType: 'plus',
    },
    accessToken: 'paste-real-access-token-here',
    sessionToken: 'paste-real-session-token-here',
    authProvider: 'openai',
  };

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function pickText(...items) {
    for (const item of items) {
      if (typeof item === 'string' && item.trim()) {
        return item.trim();
      }
    }
    return undefined;
  }

  function html(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function decodeBase64Url(input) {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function bytesToBase64Url(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function encodeJsonSegment(value) {
    return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
  }

  function readJwtPayload(token) {
    if (typeof token !== 'string' || !token.trim()) {
      return undefined;
    }
    const parts = token.split('.');
    if (parts.length < 2) {
      return undefined;
    }
    try {
      return JSON.parse(decodeBase64Url(parts[1]));
    } catch {
      return undefined;
    }
  }

  function openaiAuthClaims(payload) {
    if (!isRecord(payload)) {
      return {};
    }
    return isRecord(payload['https://api.openai.com/auth']) ? payload['https://api.openai.com/auth'] : {};
  }

  function openaiProfileClaims(payload) {
    if (!isRecord(payload)) {
      return {};
    }
    return isRecord(payload['https://api.openai.com/profile']) ? payload['https://api.openai.com/profile'] : {};
  }

  function isoTime(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      const date = new Date(value > 1e11 ? value : value * 1000);
      return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    }
    if (typeof value !== 'string' || !value.trim()) {
      return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  function isoFromSeconds(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) {
      return undefined;
    }
    const date = new Date(seconds * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  function jwtExpSeconds(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return undefined;
    }
    return Math.trunc(seconds);
  }

  function secondsFromAnyTime(value) {
    if (value === undefined || value === null || value === '') {
      return 0;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return Math.trunc(numeric > 1e11 ? numeric / 1000 : numeric);
    }
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? Math.trunc(parsed / 1000) : 0;
  }

  function secondsUntil(expiresAt, now = new Date()) {
    if (!expiresAt) {
      return undefined;
    }
    const time = new Date(expiresAt).getTime();
    if (Number.isNaN(time)) {
      return undefined;
    }
    return Math.max(0, Math.floor((time - now.getTime()) / 1000));
  }

  function axonHubLastRefresh(expiresAt, now = new Date()) {
    const time = expiresAt ? new Date(expiresAt).getTime() : NaN;
    if (Number.isNaN(time)) {
      return isoTime(now);
    }
    return new Date(time - 60 * 60 * 1000).toISOString();
  }

  function makeSyntheticIdToken(email, accountId, planType, userId, expiresAt) {
    if (!accountId) {
      return undefined;
    }
    const issuedAt = Math.trunc(Date.now() / 1000);
    const auth = { chatgpt_account_id: accountId };
    const expires = secondsFromAnyTime(expiresAt) || issuedAt + 90 * 24 * 60 * 60;
    if (planType) {
      auth.chatgpt_plan_type = planType;
    }
    if (userId) {
      auth.chatgpt_user_id = userId;
      auth.user_id = userId;
    }
    const payload = {
      iat: issuedAt,
      exp: expires,
      'https://api.openai.com/auth': auth,
    };
    if (email) {
      payload.email = email;
    }
    return `${encodeJsonSegment({ alg: 'none', typ: 'JWT', cpa_synthetic: true })}.${encodeJsonSegment(payload)}.synthetic`;
  }

  function removeEmpty(value) {
    if (Array.isArray(value)) {
      return value.map(removeEmpty).filter(item => item !== undefined);
    }
    if (isRecord(value)) {
      const entries = Object.entries(value)
        .map(([key, item]) => [key, removeEmpty(item)])
        .filter(([, item]) => item !== undefined);
      return entries.length ? Object.fromEntries(entries) : undefined;
    }
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    return value;
  }

  function emailKey(email) {
    if (typeof email !== 'string') {
      return undefined;
    }
    return email
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function cleanFileToken(value, fallback = 'chatgpt-session') {
    const source = pickText(value, fallback) || fallback;
    return source
      .replace(/\.[^.]+$/u, '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 80) || fallback;
  }

  function timestampForFile(date = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  }

  function displayTime(value) {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    const pad = item => String(item).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function findSessionObjects(root, sourceName = '') {
    const matches = [];
    const visited = new WeakSet();

    function walk(item, path) {
      if (!isRecord(item) && !Array.isArray(item)) {
        return;
      }
      if (isRecord(item)) {
        if (visited.has(item)) {
          return;
        }
        visited.add(item);
        const accessToken = pickText(
          item.accessToken,
          item.access_token,
          item.tokens?.accessToken,
          item.tokens?.access_token,
          item.token?.accessToken,
          item.token?.access_token,
          item.credentials?.accessToken,
          item.credentials?.access_token,
        );
        const hasIdentity = isRecord(item.user) || pickText(
          item.email,
          item.name,
          item.label,
          item.meta?.label,
          item.tokens?.accountId,
          item.tokens?.account_id,
          item.tokens?.chatgptAccountId,
          item.tokens?.chatgpt_account_id,
          item.providerSpecificData?.chatgptAccountId,
          item.providerSpecificData?.chatgpt_account_id,
          item.id,
        );
        if (accessToken && hasIdentity) {
          matches.push({ value: item, sourceName, path });
          return;
        }
        Object.entries(item).forEach(([key, child]) => {
          if (key !== 'accessToken' && key !== 'access_token' && key !== 'sessionToken') {
            walk(child, `${path}.${key}`);
          }
        });
        return;
      }
      item.forEach((child, index) => walk(child, `${path}[${index}]`));
    }

    walk(root, '$');
    return matches;
  }

  function parsePastedJson(text) {
    if (typeof text !== 'string' || !text.trim()) {
      return [];
    }
    let document;
    try {
      document = JSON.parse(text);
    } catch (error) {
      throw new Error(`JSON 解析失败：${error.message}`);
    }
    return findSessionObjects(document);
  }

  function convertOne(record, options = {}) {
    if (!isRecord(record)) {
      throw new Error('session 不是 JSON 对象');
    }

    const accessToken = pickText(
      record.accessToken,
      record.access_token,
      record.tokens?.accessToken,
      record.tokens?.access_token,
      record.token?.accessToken,
      record.token?.access_token,
      record.credentials?.accessToken,
      record.credentials?.access_token,
    );
    if (!accessToken) {
      throw new Error('缺少 accessToken');
    }

    const sessionToken = pickText(
      record.sessionToken,
      record.session_token,
      record.tokens?.sessionToken,
      record.tokens?.session_token,
      record.token?.sessionToken,
      record.token?.session_token,
      record.credentials?.session_token,
    );
    const refreshToken = pickText(
      record.refreshToken,
      record.refresh_token,
      record.tokens?.refreshToken,
      record.tokens?.refresh_token,
      record.token?.refreshToken,
      record.token?.refresh_token,
      record.credentials?.refresh_token,
    );
    const providedIdToken = pickText(
      record.idToken,
      record.id_token,
      record.tokens?.idToken,
      record.tokens?.id_token,
      record.token?.idToken,
      record.token?.id_token,
      record.credentials?.id_token,
    );

    const accessClaims = readJwtPayload(accessToken);
    const idClaims = readJwtPayload(providedIdToken);
    const accessAuth = openaiAuthClaims(accessClaims);
    const idAuth = openaiAuthClaims(idClaims);
    const accessProfile = openaiProfileClaims(accessClaims);
    const accessTokenExpiresAt = jwtExpSeconds(accessClaims?.exp);
    const expiresAt = pickText(
      accessClaims ? isoFromSeconds(accessClaims.exp) : undefined,
      isoTime(record.expires),
      isoTime(record.expiresAt),
      isoTime(record.expired),
      isoTime(record.expires_at),
    );
    const email = pickText(
      record.user?.email,
      record.email,
      record.meta?.label,
      record.label,
      record.credentials?.email,
      record.providerSpecificData?.email,
      accessProfile.email,
      idClaims?.email,
      accessClaims?.email,
    );
    const accountId = pickText(
      record.account?.id,
      record.account_id,
      record.tokens?.accountId,
      record.tokens?.account_id,
      record.chatgptAccountId,
      record.chatgpt_account_id,
      record.meta?.chatgptAccountId,
      record.meta?.chatgpt_account_id,
      record.tokens?.chatgptAccountId,
      record.tokens?.chatgpt_account_id,
      record.providerSpecificData?.chatgptAccountId,
      record.providerSpecificData?.chatgpt_account_id,
      record.credentials?.chatgpt_account_id,
      accessAuth.chatgpt_account_id,
      idAuth.chatgpt_account_id,
      record.provider === 'codex' ? record.id : undefined,
    );
    const chatgptAccountId = pickText(
      record.chatgptAccountId,
      record.chatgpt_account_id,
      record.meta?.chatgptAccountId,
      record.meta?.chatgpt_account_id,
      record.tokens?.chatgptAccountId,
      record.tokens?.chatgpt_account_id,
      record.providerSpecificData?.chatgptAccountId,
      record.providerSpecificData?.chatgpt_account_id,
      record.credentials?.chatgpt_account_id,
      accessAuth.chatgpt_account_id,
      idAuth.chatgpt_account_id,
    );
    const workspaceId = pickText(
      record.account?.workspaceId,
      record.account?.workspace_id,
      record.workspaceId,
      record.workspace_id,
      record.meta?.workspaceId,
      record.meta?.workspace_id,
      record.providerSpecificData?.workspaceId,
      record.providerSpecificData?.workspace_id,
      record.credentials?.workspace_id,
      accessClaims?.workspace_id,
      idClaims?.workspace_id,
    );
    const userId = pickText(
      record.user?.id,
      record.user_id,
      record.chatgptUserId,
      record.providerSpecificData?.chatgptUserId,
      record.providerSpecificData?.chatgpt_user_id,
      accessAuth.chatgpt_user_id,
      accessAuth.user_id,
      idAuth.chatgpt_user_id,
      idAuth.user_id,
    );
    const planType = pickText(
      record.account?.planType,
      record.account?.plan_type,
      record.planType,
      record.plan_type,
      record.providerSpecificData?.chatgptPlanType,
      record.providerSpecificData?.chatgpt_plan_type,
      record.credentials?.plan_type,
      accessAuth.chatgpt_plan_type,
      idAuth.chatgpt_plan_type,
    );

    const now = options.now || new Date();
    const exportedAt = isoTime(now);
    const expiresIn = secondsUntil(expiresAt, now);
    const sourceName = pickText(options.sourceName, '');
    const sourceType = record.provider === 'codex' && record.authType === 'oauth' ? '9Router' : 'chatgpt_web_session';
    const name = pickText(email, sourceName, 'ChatGPT Account');
    const generatedIdToken = providedIdToken ? undefined : makeSyntheticIdToken(email, accountId, planType, userId, expiresAt);
    const idToken = pickText(providedIdToken, generatedIdToken);

    const cpa = Object.fromEntries(Object.entries({
      type: 'codex',
      account_id: accountId,
      chatgpt_account_id: accountId,
      email,
      name,
      plan_type: planType,
      chatgpt_plan_type: planType,
      id_token: idToken,
      id_token_synthetic: Boolean(generatedIdToken) || undefined,
      access_token: accessToken,
      refresh_token: refreshToken || '',
      session_token: sessionToken,
      last_refresh: exportedAt,
      expired: expiresAt,
      disabled: Boolean(record.disabled) || undefined,
    }).filter(([, value]) => value !== undefined && value !== null));

    const cockpit = {
      type: 'codex',
      id_token: idToken,
      access_token: accessToken,
      refresh_token: refreshToken || '',
      account_id: accountId,
      last_refresh: exportedAt,
      email,
      expired: expiresAt,
      account_note: pickText(record.account_note, record.accountInfo, record.account_info, record.note, record.notes, record.remark),
    };

    const Sub2APIAccount = removeEmpty({
      name: pickText(name, email, sourceName, 'ChatGPT Account'),
      platform: 'openai',
      type: 'oauth',
      expires_at: accessTokenExpiresAt,
      auto_pause_on_expired: true,
      concurrency: 10,
      priority: 1,
      credentials: {
        access_token: accessToken,
        chatgpt_account_id: accountId,
        chatgpt_user_id: userId,
        email,
        expires_at: expiresAt,
        expires_in: expiresIn,
        plan_type: planType,
      },
      extra: {
        email,
        email_key: emailKey(email),
        name,
        auth_provider: pickText(record.authProvider, record.auth_provider),
        source: sourceType,
        last_refresh: exportedAt,
      },
    });

    const priority = Number.isFinite(Number(record.priority)) ? Number(record.priority) : 9;
    const isActive = typeof record.isActive === 'boolean' ? record.isActive : !Boolean(record.disabled);
    const createdAt = isoTime(record.createdAt) || exportedAt;
    const updatedAt = isoTime(record.updatedAt) || exportedAt;
    const nineRouter = removeEmpty({
      accessToken,
      refreshToken,
      expiresAt,
      testStatus: pickText(record.testStatus, record.test_status, 'active'),
      expiresIn,
      providerSpecificData: {
        chatgptAccountId: accountId,
        chatgptPlanType: planType,
      },
      id: accountId,
      provider: 'codex',
      authType: 'oauth',
      name,
      email,
      priority,
      isActive,
      createdAt,
      updatedAt,
    });

    const codexAuthJson = {
      auth_mode: 'chatgpt',
      OPENAI_API_KEY: null,
      tokens: {
        id_token: idToken,
        access_token: accessToken,
        refresh_token: refreshToken || '',
        account_id: accountId,
      },
      last_refresh: exportedAt,
    };

    const axonHub = removeEmpty({
      auth_mode: 'chatgpt',
      last_refresh: axonHubLastRefresh(expiresAt, now),
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken || axonHubMissingRefreshToken,
        id_token: idToken,
      },
      axonhub_refresh_token_placeholder: refreshToken ? undefined : true,
      axonhub_note: refreshToken ? undefined : 'refresh_token is a placeholder; access_token works only until it expires.',
    });

    const managerHints = Object.fromEntries(Object.entries({
      account_id: accountId,
      chatgpt_account_id: chatgptAccountId,
    }).filter(([, value]) => value !== undefined && value !== null && value !== ''));
    const managerMeta = Object.fromEntries(Object.entries({
      label: pickText(name, email, sourceName, 'ChatGPT Account'),
      workspace_id: workspaceId,
      chatgpt_account_id: chatgptAccountId,
      note: 'Imported from ChatGPT session',
    }).filter(([, value]) => value !== undefined && value !== null && value !== ''));
    const codexManager = {
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken || '',
        id_token: providedIdToken || '',
        ...managerHints,
      },
      meta: managerMeta,
    };

    return {
      sourceName,
      sourcePath: options.sourcePath,
      email,
      name,
      expiresAt,
      cpa,
      cockpit,
      nineRouter,
      codexAuthJson,
      axonHub,
      codexManager,
      Sub2APIAccount,
    };
  }

  function Sub2APIDocument(accounts, now = new Date()) {
    return {
      exported_at: isoTime(now),
      proxies: [],
      accounts: accounts.map(item => item.Sub2APIAccount),
    };
  }

  function outputDocument() {
    const now = new Date();
    if (state.format === 'Sub2API') {
      return Sub2APIDocument(state.accounts, now);
    }
    if (state.format === 'cpa') {
      return state.accounts.length === 1 ? state.accounts[0].cpa : state.accounts.map(item => item.cpa);
    }
    if (state.format === 'cockpit') {
      return state.accounts.length === 1 ? state.accounts[0].cockpit : state.accounts.map(item => item.cockpit);
    }
    if (state.format === '9Router') {
      return state.accounts.length === 1 ? state.accounts[0].nineRouter : state.accounts.map(item => item.nineRouter);
    }
    if (state.format === 'codex') {
      return state.accounts.length === 1 ? state.accounts[0].codexAuthJson : state.accounts.map(item => item.codexAuthJson);
    }
    if (state.format === 'axonhub') {
      return state.accounts.length === 1 ? state.accounts[0].axonHub : state.accounts.map(item => item.axonHub);
    }
    if (state.format === 'codexmanager') {
      return state.accounts.length === 1 ? state.accounts[0].codexManager : state.accounts.map(item => item.codexManager);
    }
    return Sub2APIDocument(state.accounts, now);
  }

  function setStatus(element, message, tone = '') {
    if (!element) {
      return;
    }
    element.textContent = message;
    element.classList.toggle('is-ok', tone === 'ok');
    element.classList.toggle('is-error', tone === 'error');
  }

  function renderAccountRows() {
    if (!state.accounts.length) {
      ui.accountRows.innerHTML = '<tr><td colspan="3" class="px-3 py-4 text-sm text-slate-500">暂无可转换账号。</td></tr>';
      return;
    }
    ui.accountRows.innerHTML = state.accounts.map(item => `
      <tr>
        <td class="border-b px-3 py-2"><div class="truncate" title="${html(item.name)}">${html(item.name || '-')}</div></td>
        <td class="border-b px-3 py-2"><div class="truncate" title="${html(item.email)}">${html(item.email || '-')}</div></td>
        <td class="border-b px-3 py-2"><div class="truncate" title="${html(item.expiresAt)}">${html(displayTime(item.expiresAt) || '-')}</div></td>
      </tr>
    `).join('');
  }

  function renderIssues() {
    if (!state.rejected.length) {
      ui.issues.classList.remove('is-visible');
      ui.issues.textContent = '';
      return;
    }
    ui.issues.classList.add('is-visible');
    ui.issues.innerHTML = state.rejected
      .map(item => {
        const location = [item.sourceName, item.path].filter(Boolean).join(' ');
        return `<div>${location ? `${html(location)}: ` : ''}${html(item.reason)}</div>`;
      })
      .join('');
  }

  function refreshOutput() {
    const hasAccounts = state.accounts.length > 0;
    state.outputText = hasAccounts ? JSON.stringify(outputDocument(), null, 2) : '';
    renderHighlightedOutput();
    ui.copyOutput.disabled = !state.outputText;
    ui.downloadOutput.disabled = !state.outputText;
    ui.statCount.textContent = String(state.accounts.length);
    ui.statErrors.textContent = String(state.rejected.length);
    ui.formatSelect.value = state.format;
    ui.outputSubtitle.textContent = `当前输出为 ${formatNames[state.format]} 导入 JSON。`;
    ui.tokenNotice.hidden = !['cpa', 'cockpit', 'codex', 'axonhub', 'codexmanager'].includes(state.format);
    renderAccountRows();
    renderIssues();
    setStatus(ui.outputStatus, '');
  }

  function renderHighlightedOutput() {
    ui.output.textContent = state.outputText;
    ui.output.removeAttribute('data-highlighted');
    if (state.outputText && window.hljs) {
      window.hljs.highlightElement(ui.output);
    }
  }

  function convertTextInput(text) {
    const sources = parsePastedJson(text);
    const now = new Date();
    const accounts = [];
    const rejected = [];
    sources.forEach((source, index) => {
      try {
        accounts.push(convertOne(source.value, {
          now,
          sourceName: source.sourceName,
          sourcePath: source.path || `$[${index}]`,
        }));
      } catch (error) {
        rejected.push({
          sourceName: source.sourceName,
          path: source.path,
          reason: error instanceof Error ? error.message : '无法转换',
        });
      }
    });
    if (!sources.length) {
      rejected.push({
        sourceName: '',
        path: '$',
        reason: '未找到包含 accessToken 和 user/email 的 session 对象',
      });
    }
    state.accounts = accounts;
    state.rejected = rejected;
    refreshOutput();
  }

  function syncFromTextarea() {
    const text = ui.input.value;
    if (!text.trim()) {
      state.accounts = [];
      state.rejected = [];
      refreshOutput();
      return;
    }
    try {
      convertTextInput(text);
    } catch (error) {
      state.accounts = [];
      state.rejected = [{
        sourceName: '',
        path: '$',
        reason: error instanceof Error ? error.message : 'JSON 解析失败',
      }];
      refreshOutput();
    }
  }

  async function convertFiles(fileList) {
    const files = Array.from(fileList || []).filter(file => file.name.toLowerCase().endsWith('.json'));
    if (!files.length) {
      state.accounts = [];
      state.rejected = [{
        sourceName: 'file-input',
        path: '',
        reason: '没有选择 JSON 文件',
      }];
      refreshOutput();
      return;
    }
    const sources = [];
    const rejected = [];
    for (const file of files) {
      const sourceName = file.webkitRelativePath || file.name;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const found = findSessionObjects(parsed, sourceName);
        if (!found.length) {
          rejected.push({ sourceName, path: '$', reason: '未找到包含 accessToken 和 user/email 的 session 对象' });
        }
        sources.push(...found);
      } catch (error) {
        rejected.push({
          sourceName,
          path: '$',
          reason: error instanceof Error ? error.message : '无法读取文件',
        });
      }
    }
    const now = new Date();
    const accounts = [];
    sources.forEach(source => {
      try {
        accounts.push(convertOne(source.value, {
          now,
          sourceName: source.sourceName,
          sourcePath: source.path,
        }));
      } catch (error) {
        rejected.push({
          sourceName: source.sourceName,
          path: source.path,
          reason: error instanceof Error ? error.message : '无法转换',
        });
      }
    });
    state.accounts = accounts;
    state.rejected = rejected;
    ui.input.value = sources.length === 1
      ? JSON.stringify(sources[0].value, null, 2)
      : JSON.stringify(sources.map(source => source.value), null, 2);
    refreshOutput();
  }

  function downloadOutput() {
    if (!state.outputText) {
      return;
    }
    const first = state.accounts[0];
    const filename = `${cleanFileToken(first?.email || first?.name || state.format)}.${state.format}.${timestampForFile()}.json`;
    const blob = new Blob([state.outputText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyOutput() {
    if (!state.outputText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(state.outputText);
      setStatus(ui.outputStatus, '已复制到剪贴板。', 'ok');
    } catch {
      const fallback = document.createElement('textarea');
      fallback.value = state.outputText;
      fallback.setAttribute('readonly', '');
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      document.body.append(fallback);
      fallback.select();
      document.execCommand('copy');
      fallback.remove();
      setStatus(ui.outputStatus, '已复制到剪贴板。', 'ok');
    }
  }

  ui.formatSelect.addEventListener('change', () => {
    state.format = ui.formatSelect.value;
    refreshOutput();
  });

  ui.input.addEventListener('input', syncFromTextarea);
  ui.copyOutput.addEventListener('click', copyOutput);
  ui.downloadOutput.addEventListener('click', downloadOutput);
  ui.pickFiles.addEventListener('click', () => ui.fileInput.click());
  ui.fileInput.addEventListener('change', event => {
    convertFiles(event.target.files);
    event.target.value = '';
  });
  ui.clearInput.addEventListener('click', () => {
    ui.input.value = '';
    syncFromTextarea();
  });
  ui.loadExample.addEventListener('click', () => {
    ui.input.value = JSON.stringify(sampleSession, null, 2);
    syncFromTextarea();
  });

  refreshOutput();
})();
