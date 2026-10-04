import { validatePublicSubmittedUrl } from '../submitted-url.js';

/** Three-step shop submission; final status always comes from the submission API. */
export function initShopSubmitFlow(dialog, messages) {
  if (!dialog) return;
  const form = dialog.querySelector('#submitForm');
  const input = dialog.querySelector('#urlInput');
  const clientError = dialog.querySelector('#clientError');
  const serverError = dialog.querySelector('#submitError');
  const success = dialog.querySelector('#submitSuccess');
  const back = dialog.querySelector('[data-shop-back]');
  const next = dialog.querySelector('[data-shop-continue]');
  const submit = dialog.querySelector('[data-shop-submit]');
  const done = dialog.querySelector('[data-shop-done]');
  let step = 1;
  let pending = false;
  let generation = 0;
  let confirmedUrl = '';

  function clearErrors() {
    for (const error of [clientError, serverError]) {
      error.textContent = '';
      error.classList.add('hidden');
    }
    input.removeAttribute('aria-invalid');
  }
  function showStep(value) {
    step = value;
    dialog.querySelector('.submission-step-actions').dataset.activeStep = String(step);
    dialog.querySelectorAll('[data-shop-step]').forEach(panel => { panel.hidden = Number(panel.dataset.shopStep) !== step; });
    dialog.querySelectorAll('[data-step-indicator]').forEach(indicator => {
      const number = Number(indicator.dataset.stepIndicator);
      if (number === step) indicator.setAttribute('aria-current', 'step');
      else indicator.removeAttribute('aria-current');
      indicator.toggleAttribute('data-step-complete', number < step);
      indicator.querySelector('[data-step-number]').textContent = number < step ? '✓' : String(number);
    });
    next.hidden = step !== 1;
    back.hidden = step !== 2;
    submit.hidden = step !== 2;
    done.hidden = step !== 3;
  }
  function setPending(value) {
    pending = value;
    form.setAttribute('aria-busy', String(value));
    back.disabled = value;
    submit.disabled = value;
  }
  function showServerError(message) {
    serverError.textContent = message;
    serverError.classList.remove('hidden');
  }
  input.addEventListener('input', clearErrors);
  back.addEventListener('click', () => {
    if (pending) return;
    clearErrors();
    showStep(1);
    input.focus();
  });
  done.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    // Ignore a response for a dialog that was closed and reopened while submitting.
    generation += 1;
    form.reset();
    confirmedUrl = '';
    success.textContent = '';
    clearErrors();
    setPending(false);
    showStep(1);
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || step === 3) return;
    clearErrors();
    if (step === 1) {
      const changes = [];
      const validation = validatePublicSubmittedUrl(input.value, changes);
      if (!validation.ok) {
        clientError.textContent = messages[validation.reason] || messages.invalidUrl;
        clientError.classList.remove('hidden');
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      confirmedUrl = validation.url;
      dialog.querySelector('[data-shop-original-url]').textContent = input.value;
      dialog.querySelector('[data-shop-confirm-url]').textContent = confirmedUrl;
      dialog.querySelector('[data-shop-normalization-status]').textContent = changes.length ? messages.urlChanged : messages.urlUnchanged;
      const rules = dialog.querySelector('[data-shop-normalization-rules]');
      rules.replaceChildren(...changes.map(change => {
        const item = document.createElement('li');
        item.textContent = messages.urlChanges[change.kind].replace('{from}', change.from || '').replace('{to}', change.to || '');
        return item;
      }));
      rules.hidden = changes.length === 0;
      showStep(2);
      submit.focus();
      return;
    }
    const requestGeneration = ++generation;
    setPending(true);
    window.CardNavTelemetry?.track('form-submit', { form: 'shop-submit' }, form);
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: JSON.stringify({ url: confirmedUrl, locale: dialog.dataset.locale }),
        headers: { accept: 'application/json', 'content-type': 'application/json', 'x-requested-with': 'fetch' },
      });
      const payload = await response.json().catch(() => null);
      if (requestGeneration !== generation) return;
      if (!response.ok || payload?.ok !== true) {
        showServerError(payload?.message || messages.failed);
        return;
      }
      success.textContent = payload.message || messages.success;
      dialog.querySelector('[data-shop-result-url]').textContent = payload.url || confirmedUrl;
      showStep(3);
      success.focus();
    } catch {
      if (requestGeneration === generation) showServerError(messages.failed);
    } finally {
      if (requestGeneration === generation) setPending(false);
    }
  });
}
