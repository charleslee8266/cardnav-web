import { validatePublicSubmittedUrl } from '../submitted-url.js';
import { initShopSubmitFlow } from './shop-submit.js';

function parseJsonScript(id) {
  return JSON.parse(document.getElementById(id)?.textContent || '{}');
}

function initShopSubmit() {
  const dialog = document.querySelector('#shopSubmitDialog');
  initShopSubmitFlow(dialog, parseJsonScript('shop-submit-messages'));
}

function initGatewaySubmit() {
  const config = parseJsonScript('gateway-submit-messages');
  const messages = config.submit || {};
  const dialog = document.querySelector('#gatewaySubmitDialog');
  const form = dialog?.querySelector('#gatewaySubmitForm');
  if (!dialog || !form) return;
  const fields = Object.fromEntries(['url', 'apiEndpoint', 'name', 'summary'].map(name => [name, form.elements.namedItem(name)]));
  const paymentSelect = dialog.querySelector('#gatewayPaymentSelect');
  const payments = [...paymentSelect.querySelectorAll('input')];
  const error = dialog.querySelector('#gatewaySubmitError');
  const success = dialog.querySelector('#gatewaySubmitSuccess');
  const next = dialog.querySelector('[data-gateway-next]');
  const back = dialog.querySelector('[data-gateway-back]');
  const submit = dialog.querySelector('[data-gateway-submit]');
  const done = dialog.querySelector('[data-gateway-done]');
  let step = 1;
  let pending = false;
  let generation = 0;
  let confirmed = null;
  const paymentLabels = () => payments.filter(input => input.checked).map(input => input.closest('label').textContent.trim());
  const clearError = () => { error.hidden = true; error.textContent = ''; Object.values(fields).forEach(input => input.removeAttribute('aria-invalid')); };
  const fail = (message, field) => { error.textContent = message || messages.failed; error.hidden = false; if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); } else error.focus(); };
  const showStep = value => {
    step = value;
    dialog.querySelector('.submission-step-actions').dataset.activeStep = String(step);
    dialog.querySelectorAll('[data-gateway-step]').forEach(panel => { panel.hidden = Number(panel.dataset.gatewayStep) !== step; });
    dialog.querySelectorAll('[data-step-indicator]').forEach(indicator => {
      const number = Number(indicator.dataset.stepIndicator);
      if (number === step) indicator.setAttribute('aria-current', 'step'); else indicator.removeAttribute('aria-current');
      indicator.toggleAttribute('data-step-complete', number < step);
      indicator.querySelector('[data-step-number]').textContent = number < step ? '✓' : String(number);
    });
    next.hidden = step !== 1; back.hidden = submit.hidden = step !== 2; done.hidden = step !== 3;
  };
  const setPending = value => { pending = value; form.setAttribute('aria-busy', String(value)); back.disabled = submit.disabled = value; };
  back.addEventListener('click', () => { if (pending) return; clearError(); showStep(1); fields.name.focus(); });
  done.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { generation++; form.reset(); confirmed = null; setPending(false); clearError(); success.textContent = ''; showStep(1); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || step === 3) return;
    clearError();
    if (step === 1) {
      if (!fields.name.value.trim()) { fail(messages.invalidGatewayName, fields.name); return; }
      if (fields.name.value.trim().length > 20) { fail(messages.gatewayNameTooLong, fields.name); return; }
      if (fields.summary.value.trim().length > 150) { fail(messages.gatewaySummaryTooLong, fields.summary); return; }
      const validation = validatePublicSubmittedUrl(fields.url.value);
      if (!validation.ok) { fail(messages.gatewayInvalidUrl, fields.url); return; }
      let endpoint = fields.apiEndpoint.value.trim();
      if (endpoint) {
        try { const parsed = new URL(endpoint); if (!['http:', 'https:'].includes(parsed.protocol)) throw Error('protocol'); parsed.hash = ''; endpoint = parsed.toString().replace(/\/$/, ''); }
        catch { fail(messages.gatewayInvalidApiEndpoint, fields.apiEndpoint); return; }
      }
      confirmed = { locale: config.locale, url: validation.url, apiEndpoint: endpoint, name: fields.name.value.trim(), summary: fields.summary.value.trim(), paymentMethods: payments.filter(input => input.checked).map(input => input.value) };
      dialog.querySelectorAll('[data-gateway-review]').forEach(output => {
        const field = output.dataset.gatewayReview;
        output.textContent = field === 'paymentMethods' ? paymentLabels().join(config.gateway.paymentMethodSeparator || ', ') || '—' : field === 'apiEndpoint' ? confirmed.apiEndpoint || confirmed.url : confirmed[field] || '—';
      });
      showStep(2); submit.focus(); return;
    }
    const requestGeneration = generation;
    setPending(true);
    window.CardNavTelemetry?.track('form-submit', { form: 'gateway-submit' }, form);
    try {
      const response = await fetch(form.action, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'x-requested-with': 'fetch' }, body: JSON.stringify(confirmed) });
      const payload = await response.json().catch(() => null);
      if (requestGeneration !== generation) return;
      if (!response.ok || !payload?.ok) { fail(payload?.message || messages.failed); return; }
      success.textContent = payload.message || messages.success; showStep(3); success.focus();
    } catch { if (requestGeneration === generation) fail(messages.failed); }
    finally { if (requestGeneration === generation) setPending(false); }
  });
}


initShopSubmit();
initGatewaySubmit();
