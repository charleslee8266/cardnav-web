/**
 * 文件说明: 管理赞赏身份、站点搜索、金额归一化及支付创建、到账确认与最小化 telemetry 上报。
 * 对应文档: docs/specs/public-telemetry.md
 */
type SupportOpenDetail = { entry?: 'cta' | 'url'; sourceElement?: Element };
type SupportPaymentStatus = 'pending' | 'paid' | 'cancelled' | 'failed';

class SupportDialog {
  private dialog: HTMLDialogElement;
  private form: HTMLFormElement;
  private search: HTMLInputElement;
  private selectedSite: HTMLInputElement;
  private options: HTMLElement;
  private siteSubmit: HTMLAnchorElement;
  private candidates: { id: string; name: string; url: string }[] = [];
  private activeOption = -1;
  private amount: HTMLInputElement;
  private personFields: HTMLFieldSetElement;
  private siteFields: HTMLFieldSetElement;
  private status: HTMLElement;
  private paymentStatus: HTMLElement;
  private returnStatus: HTMLElement;
  private dialogDescription: HTMLElement | null;
  private paymentStateTitle: HTMLElement;
  private paymentWindowNotice: HTMLElement;
  private paymentLoading: HTMLElement;
  private paymentWindowHint: HTMLElement;
  private successDetails: HTMLElement;
  private successIdentity: HTMLElement;
  private successAmount: HTMLElement;
  private successMessageRow: HTMLElement;
  private successMessage: HTMLElement;
  private openPaymentButton: HTMLButtonElement;
  private cancelPaymentButton: HTMLButtonElement;
  private paymentUrl = '';
  private payButton: HTMLButtonElement;
  private messages: Record<string, string>;
  private request?: AbortController;
  private sitesByKind = new Map<string, { id: string; name: string; url: string }[]>();
  private loadingKind: string | null = null;
  private statusTimer?: ReturnType<typeof setTimeout>;
  private statusRequest?: AbortController;
  private busy = false;
  private statusToken: string | null;
  private reportedPaymentStatuses = new Set<string>();

  constructor(dialog: HTMLDialogElement) {
    this.dialog = dialog;
    const paymentWindow = window as Window & { cardnavSupportStatusToken?: string };
    this.statusToken = paymentWindow.cardnavSupportStatusToken || null;
    delete paymentWindow.cardnavSupportStatusToken;
    this.form = dialog.querySelector('[data-support-form]')!;
    this.search = dialog.querySelector('[data-site-search]')!;
    this.selectedSite = dialog.querySelector('[data-site-value]')!;
    this.options = dialog.querySelector('[data-site-options]')!;
    this.siteSubmit = dialog.querySelector('[data-site-submit]')!;
    this.amount = dialog.querySelector('[name="amount"]')!;
    this.personFields = dialog.querySelector('[data-person-fields]')!;
    this.siteFields = dialog.querySelector('[data-site-fields]')!;
    this.status = dialog.querySelector('[data-site-status]')!;
    this.paymentStatus = dialog.querySelector('[data-payment-status]')!;
    this.returnStatus = dialog.querySelector('[data-return-status]')!;
    this.dialogDescription = dialog.querySelector('.form-dialog-description');
    this.paymentStateTitle = dialog.querySelector('[data-payment-state-title]')!;
    this.paymentWindowNotice = dialog.querySelector('[data-payment-window-notice]')!;
    this.paymentLoading = dialog.querySelector('[data-payment-loading]')!;
    this.paymentWindowHint = dialog.querySelector('[data-payment-window-hint]')!;
    this.successDetails = dialog.querySelector('[data-success-details]')!;
    this.successIdentity = dialog.querySelector('[data-success-identity]')!;
    this.successAmount = dialog.querySelector('[data-success-amount]')!;
    this.successMessageRow = dialog.querySelector('[data-success-message-row]')!;
    this.successMessage = dialog.querySelector('[data-success-message]')!;
    this.openPaymentButton = dialog.querySelector('[data-open-payment]')!;
    this.cancelPaymentButton = dialog.querySelector('[data-cancel-payment]')!;
    this.payButton = dialog.querySelector('[data-pay-button]')!;
    this.messages = JSON.parse(dialog.dataset.messages || '{}');
    this.search.addEventListener('input', () => {
      this.selectedSite.value = '';
      this.search.setCustomValidity(this.messages.select);
      this.filterSites();
    });
    this.search.addEventListener('focus', () => {
      if (this.candidates.length) this.showOptions();
      else if (this.kind !== 'person') void this.loadSites();
    });
    this.search.addEventListener('click', () => this.showOptions());
    this.search.addEventListener('keydown', event => this.navigateOptions(event));
    this.options.addEventListener('click', event => {
      const option = (event.target as Element).closest<HTMLElement>('[data-option-index]');
      if (option) this.chooseSite(Number(option.dataset.optionIndex));
    });
    const combobox = dialog.querySelector('[data-site-combobox]')!;
    combobox.addEventListener('focusout', event => {
      if (!combobox.contains((event as FocusEvent).relatedTarget as Node | null)) this.closeOptions();
    });
    dialog.addEventListener('click', event => {
      if (!combobox.contains(event.target as Node)) this.closeOptions();
    });
    this.form.querySelectorAll('[name="kind"]').forEach(radio => radio.addEventListener('change', () => this.changeIdentity()));
    this.form.querySelectorAll('[name="paymentType"]').forEach(radio => radio.addEventListener('change', () => {
      this.track('support-payment-method-change', { 'payment-type': String((radio as HTMLInputElement).value) });
    }));
    this.amount.addEventListener('blur', () => this.normalizeAmount());
    this.form.addEventListener('submit', event => {
      event.preventDefault();
      void this.pay(String(new FormData(this.form).get('paymentType')));
    });
    this.openPaymentButton.addEventListener('click', () => {
      this.track('support-payment-window-open', {});
      if (this.paymentUrl) window.open(this.paymentUrl, 'paymentPopup', getPaymentPopupFeatures());
    });
    this.cancelPaymentButton.addEventListener('click', () => void this.cancelPayment());
    dialog.addEventListener('support-open', event => {
      const detail = (event as CustomEvent<SupportOpenDetail>).detail;
      this.track('support-open', { entry: detail?.entry === 'cta' ? 'cta' : 'url' }, detail?.sourceElement || this.dialog);
      this.open();
    });
    dialog.addEventListener('close', () => {
      clearTimeout(this.statusTimer);
      this.statusRequest?.abort();
      this.request?.abort();
      this.closeOptions();
    });
    if (dialog.open) this.open();
  }

  private get kind() {
    return String(new FormData(this.form).get('kind'));
  }

  private track(eventName: string, eventData: Record<string, string>, sourceElement: Element = this.dialog) {
    const telemetryWindow = window as Window & {
      CardNavTelemetry?: { track: (name: string, data: Record<string, string>, sourceElement?: Element) => void };
    };
    telemetryWindow.CardNavTelemetry?.track(eventName, eventData, sourceElement);
  }

  private open() {
    if (!this.statusToken && this.dialogDescription) this.dialogDescription.hidden = false;
    if (this.kind !== 'person') void this.loadSites();
    void this.checkPayment();
  }

  private changeIdentity() {
    this.request?.abort();
    const isPerson = this.kind === 'person';
    this.personFields.hidden = !isPerson;
    this.personFields.disabled = !isPerson;
    this.siteFields.hidden = isPerson;
    this.siteFields.disabled = isPerson;
    this.dialog.querySelectorAll<HTMLElement>('[data-benefit-kind]').forEach((benefit) => {
      benefit.hidden = benefit.dataset.benefitKind !== this.kind;
    });
    this.search.required = !isPerson;
    this.search.setCustomValidity(isPerson ? '' : this.messages.select);
    this.search.value = '';
    this.selectedSite.value = '';
    this.candidates = [];
    this.options.replaceChildren();
    this.closeOptions();
    this.status.textContent = '';
    this.status.className = 'form-field-hint';
    this.paymentStatus.textContent = '';
    const label = this.kind === 'shop' ? this.messages.shop : this.messages.gateway;
    this.dialog.querySelector('[data-site-label]')!.textContent = label;
    this.search.setAttribute('aria-label', label);
    this.dialog.querySelector('[data-site-submit-hint]')!.textContent = this.kind === 'shop' ? this.messages.submitShopHint : this.messages.submitGatewayHint;
    this.siteSubmit.href = this.kind === 'shop' ? this.siteSubmit.dataset.shopSubmit! : this.siteSubmit.dataset.gatewaySubmit!;
    this.siteSubmit.dataset.umamiEventUrl = this.siteSubmit.href;
    this.track('support-kind-change', { kind: this.kind });
    if (!isPerson) void this.loadSites();
  }

  private normalizeAmount() {
    const value = Number(this.amount.value);
    this.amount.value = Number.isFinite(value) ? Math.min(5000, Math.max(5, Math.round(value * 100) / 100)).toFixed(2) : '5.00';
  }

  private async loadSites() {
    const kind = this.kind;
    if (kind === 'person') return;
    if (this.sitesByKind.has(kind)) {
      this.filterSites();
      return;
    }
    if (this.loadingKind === kind && !this.request?.signal.aborted) return;
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    this.loadingKind = kind;
    this.status.className = 'form-field-hint';
    this.status.textContent = '';
    this.renderLoadingOption();
    this.search.disabled = true;
    this.search.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(`/api/support/sites?${new URLSearchParams({ kind })}`, { signal: request.signal, headers: { 'x-cardnav-locale': this.dialog.dataset.locale! } });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error();
      if (request.signal.aborted) return;
      this.sitesByKind.set(kind, data.sites);
      if (this.kind === kind) this.filterSites();
    } catch {
      if (!request.signal.aborted) {
        this.options.replaceChildren();
        this.closeOptions();
        this.status.className = 'form-field-error';
        this.status.textContent = this.messages.failed;
      }
    } finally {
      if (this.request === request) {
        this.loadingKind = null;
        this.search.disabled = false;
        this.search.removeAttribute('aria-busy');
      }
    }
  }

  private renderLoadingOption() {
    const option = document.createElement('div');
    option.setAttribute('aria-disabled', 'true');
    option.className = 'support-site-option-loading';
    option.textContent = this.messages.loading;
    this.options.replaceChildren(option);
    this.options.hidden = false;
    this.search.setAttribute('aria-expanded', 'true');
  }

  private filterSites() {
    const sites = this.sitesByKind.get(this.kind);
    if (!sites) return;
    const query = this.selectedSite.value ? '' : this.search.value.trim().toLocaleLowerCase();
    this.candidates = sites.filter(site => site.name.toLocaleLowerCase().includes(query) || site.url.toLocaleLowerCase().includes(query));
    this.options.replaceChildren();
    this.activeOption = -1;
    this.search.removeAttribute('aria-activedescendant');
    const fragment = document.createDocumentFragment();
    for (const [index, site] of this.candidates.entries()) {
      const option = document.createElement('button');
      option.type = 'button';
      option.tabIndex = -1;
      option.role = 'option';
      option.id = `supportSiteOption-${index}`;
      option.dataset.optionIndex = String(index);
      option.setAttribute('aria-selected', String(site.id === this.selectedSite.value));
      const name = document.createElement('span');
      name.textContent = site.name;
      const url = document.createElement('small');
      url.textContent = site.url;
      option.append(name, url);
      fragment.append(option);
    }
    this.options.append(fragment);
    this.status.textContent = this.candidates.length ? '' : this.messages.empty;
    if (document.activeElement === this.search) this.showOptions();
    else this.closeOptions();
  }

  private showOptions() {
    const open = this.candidates.length > 0;
    this.options.hidden = !open;
    this.search.setAttribute('aria-expanded', String(open));
  }

  private closeOptions() {
    this.options.hidden = true;
    this.activeOption = -1;
    this.search.setAttribute('aria-expanded', 'false');
    this.search.removeAttribute('aria-activedescendant');
    Array.from(this.options.children).forEach((option, index) => {
      option.setAttribute('aria-selected', String(this.candidates[index]?.id === this.selectedSite.value));
    });
  }

  private chooseSite(index: number) {
    const site = this.candidates[index];
    if (!site) return;
    this.selectedSite.value = site.id;
    this.search.value = `${site.name} — ${site.url}`;
    this.search.setCustomValidity('');
    this.search.focus();
    this.closeOptions();
  }

  private navigateOptions(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'Escape' && !this.options.hidden) {
      event.preventDefault();
      event.stopPropagation();
      this.closeOptions();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.candidates.length) return;
      this.showOptions();
      this.activeOption = this.activeOption < 0
        ? (event.key === 'ArrowDown' ? 0 : this.candidates.length - 1)
        : (this.activeOption + (event.key === 'ArrowDown' ? 1 : -1) + this.candidates.length) % this.candidates.length;
      const options = Array.from(this.options.children) as HTMLElement[];
      options.forEach((option, index) => option.setAttribute('aria-selected', String(index === this.activeOption)));
      const option = options[this.activeOption]!;
      this.search.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && !this.options.hidden) {
      event.preventDefault();
      if (this.activeOption >= 0) this.chooseSite(this.activeOption);
    }
  }

  private reportPaymentStatus(status: SupportPaymentStatus, trigger: 'automatic' | 'manual' = 'automatic') {
    const token = this.statusToken;
    if (!token) return;
    const key = `${token}:${status}`;
    if (this.reportedPaymentStatuses.has(key)) return;
    this.reportedPaymentStatuses.add(key);
    this.track('support-payment-status', { status, trigger });
  }

  private async checkPayment(attempt = 0) {
    clearTimeout(this.statusTimer);
    this.statusRequest?.abort();
    const token = this.statusToken;
    if (!token) return;
    this.dialog.querySelector<HTMLElement>('[data-return-status-panel]')!.hidden = false;
    this.returnStatus.textContent = this.messages.checking;
    const request = new AbortController();
    this.statusRequest = request;
    try {
      const response = await fetch(`/api/support/status?${new URLSearchParams({ token })}`, { signal: request.signal, headers: { 'x-cardnav-locale': this.dialog.dataset.locale! } });
      const data = await response.json();
      if (request.signal.aborted) return;
      if (!response.ok || !data.ok) throw new Error();
      const paid = data.status === 'paid';
      const cancelled = data.status === 'cancelled';
      this.returnStatus.textContent = paid ? this.messages.paid : cancelled ? this.messages.cancelled : this.messages.pending;
      this.reportPaymentStatus(paid ? 'paid' : cancelled ? 'cancelled' : 'pending');
      this.openPaymentButton.hidden = paid || cancelled || !this.paymentUrl;
      this.cancelPaymentButton.hidden = paid || cancelled;
      if (paid) this.showPaidSummary(token);
      if (cancelled) this.showCancelledSummary();
      if (!paid && !cancelled && attempt < 19 && this.dialog.open) this.statusTimer = setTimeout(() => void this.checkPayment(attempt + 1), 3000);
    } catch {
      if (!request.signal.aborted) {
        this.returnStatus.textContent = this.messages.statusFailed;
        this.reportPaymentStatus('failed');
      }
    }
  }

  private showCancelledSummary() {
    this.form.hidden = true;
    this.successDetails.hidden = false;
    this.paymentStateTitle.hidden = true;
    this.paymentWindowNotice.hidden = true;
    this.paymentWindowHint.textContent = '';
    this.openPaymentButton.hidden = true;
    this.cancelPaymentButton.hidden = true;
  }

  private showPaidSummary(token: string) {
    this.form.hidden = true;
    this.successDetails.hidden = false;
    if (this.dialogDescription) this.dialogDescription.hidden = true;
    this.paymentStateTitle.hidden = true;
    this.paymentWindowNotice.hidden = true;
    this.paymentWindowHint.textContent = '';
    this.openPaymentButton.hidden = true;
    this.cancelPaymentButton.hidden = true;
    this.successIdentity.textContent = this.messages.anonymous;
    this.successAmount.textContent = '';
    this.successMessage.textContent = '';
    this.successMessageRow.hidden = true;
    const storageKey = `cardnav-support-order:${token}`;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as {
        identity?: string;
        amount?: string;
        message?: string;
      } | null;
      if (saved) {
        this.successIdentity.textContent = saved.identity || this.messages.anonymous;
        this.successAmount.textContent = saved.amount ? `${saved.amount} CNY` : '';
        this.successMessage.textContent = saved.message || '';
        this.successMessageRow.hidden = !saved.message;
        sessionStorage.removeItem(storageKey);
      }
    } catch {
      // 会话存储不可用时仍保留赞赏成功状态。
    }
  }

  private showPendingSummary(token: string) {
    this.form.hidden = true;
    this.successDetails.hidden = false;
    if (this.dialogDescription) this.dialogDescription.hidden = true;
    this.paymentStateTitle.hidden = false;
    this.paymentStateTitle.textContent = this.messages.pendingTitle;
    this.paymentWindowNotice.hidden = false;
    this.paymentLoading.hidden = false;
    this.openPaymentButton.hidden = !this.paymentUrl;
    this.cancelPaymentButton.hidden = false;
    this.paymentWindowHint.textContent = this.messages.paymentWindowHint;
    this.successIdentity.textContent = this.messages.anonymous;
    this.successAmount.textContent = '';
    this.successMessage.textContent = '';
    this.successMessageRow.hidden = true;
    const storageKey = `cardnav-support-order:${token}`;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as {
        identity?: string;
        amount?: string;
        message?: string;
        paymentUrl?: string;
      } | null;
      if (saved) {
        this.successIdentity.textContent = saved.identity || this.messages.anonymous;
        this.successAmount.textContent = saved.amount ? `${saved.amount} CNY` : '';
        this.successMessage.textContent = saved.message || '';
        this.successMessageRow.hidden = !saved.message;
        if (saved.paymentUrl) this.paymentUrl = saved.paymentUrl;
      }
      this.openPaymentButton.hidden = !this.paymentUrl;
    } catch {
      // 会话存储不可用时仍显示等待付款状态。
    }
  }

  private setBusy(busy: boolean) {
    this.busy = busy;
    this.payButton.disabled = busy;
  }

  private async cancelPayment() {
    const token = this.statusToken;
    if (!token) return;
    this.cancelPaymentButton.disabled = true;
    try {
      const response = await fetch(`/api/support/cancel?${new URLSearchParams({ token })}`, { method: 'POST', headers: { 'x-cardnav-locale': this.dialog.dataset.locale! } });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error();
      clearTimeout(this.statusTimer);
      this.statusRequest?.abort();
      this.returnStatus.textContent = this.messages.cancelled;
      this.reportPaymentStatus('cancelled', 'manual');
      this.showCancelledSummary();
    } catch {
      this.returnStatus.textContent = this.messages.statusFailed;
      this.reportPaymentStatus('failed', 'manual');
      this.cancelPaymentButton.disabled = false;
    }
  }

  private async pay(paymentType: string) {
    if (this.busy) return;
    this.normalizeAmount();
    if (!this.form.reportValidity()) return;
    this.track('form-submit', { form: 'support', kind: this.kind, 'payment-type': paymentType });
    this.setBusy(true);
    this.paymentStatus.className = 'form-field-hint';
    this.paymentStatus.textContent = this.messages.paying;
    const fields = new FormData(this.form);
    const params = new URLSearchParams({
      kind: this.kind,
      locale: this.dialog.dataset.locale!,
      returnPage: this.dialog.dataset.returnPage!,
      siteId: this.kind === 'person' ? '' : this.selectedSite.value,
      amount: this.amount.value,
      paymentType,
    });
    if (this.kind === 'person') params.set('nickname', String(fields.get('nickname') || ''));
    params.set('email', String(fields.get('email') || ''));
    params.set('message', String(fields.get('message') || ''));
    try {
      const response = await fetch('/api/support', { method: 'POST', headers: { 'x-cardnav-locale': this.dialog.dataset.locale! }, body: params });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        this.paymentStatus.className = 'form-field-error';
        this.paymentStatus.textContent = typeof data.message === 'string' ? data.message : this.messages.failed;
        this.track('support-checkout', { status: 'failed', kind: this.kind, 'payment-type': paymentType });
        this.setBusy(false);
        return;
      }
      const identity = this.kind === 'person'
        ? String(fields.get('nickname') || '').trim() || this.messages.anonymous
        : this.search.value.trim();
      try {
        sessionStorage.setItem(`cardnav-support-order:${data.statusToken}`, JSON.stringify({
          identity,
          amount: this.amount.value,
          message: String(fields.get('message') || '').trim(),
          paymentUrl: data.payUrl,
        }));
      } catch {
        // 会话存储不可用时不影响跳转收银台。
      }
      this.statusToken = data.statusToken;
      this.showPendingSummary(data.statusToken);
      this.track('support-checkout', { status: 'created', kind: this.kind, 'payment-type': paymentType });
      void this.checkPayment();
      const target = new URL(data.payUrl);
      if (!['http:', 'https:'].includes(target.protocol)) throw new Error();
      this.paymentUrl = target.href;
      this.openPaymentButton.hidden = false;
      this.paymentWindowHint.textContent = this.messages.paymentWindowHint;
      const paymentTab = window.open(target.href, 'paymentPopup', getPaymentPopupFeatures());
      if (!paymentTab || paymentTab.closed) window.location.href = target.href;
    } catch {
      this.paymentStatus.className = 'form-field-error';
      this.paymentStatus.textContent = this.messages.failed;
      this.track('support-checkout', { status: 'failed', kind: this.kind, 'payment-type': paymentType });
      this.setBusy(false);
    }
  }
}

function getPaymentPopupFeatures() {
  const screen = typeof window !== 'undefined' ? window.screen : null;
  const availableWidth = screen?.availWidth ?? 1250;
  const availableHeight = screen?.availHeight ?? 900;
  const width = Math.min(1250, Math.max(320, availableWidth - 40));
  const height = Math.min(900, Math.max(480, availableHeight - 40));
  const left = Math.max(0, Math.floor((availableWidth - width) / 2));
  const top = Math.max(0, Math.floor((availableHeight - height) / 2));
  return `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`;
}

const dialog = document.querySelector<HTMLDialogElement>('#supportDialog');
if (dialog) new SupportDialog(dialog);
