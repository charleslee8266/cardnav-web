/** Render removable filter chips from the controls that own the filter values. */
export function renderFilterSummary(container, controls, { clearLabel, onChange, countElement } = {}) {
  if (!container) return;
  const active = controls.filter(({ input }) => input && (input.type === 'checkbox' ? input.checked : input.value.trim()));
  const reset = input => {
    if (input.type === 'checkbox') input.checked = false;
    else input.value = '';
  };
  container.replaceChildren();
  container.hidden = active.length === 0;
  if (countElement) {
    countElement.hidden = active.length === 0;
    countElement.textContent = String(active.length);
  }
  for (const { input, label } of active) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'data-filter-chip';
    button.textContent = `${label()} ×`;
    button.addEventListener('click', () => { reset(input); onChange?.(); const panel = input.closest('[popover]'); const target = panel && !panel.matches(':popover-open') ? panel.parentElement.querySelector('[data-filter-trigger]') : input; target?.focus(); });
    container.append(button);
  }
  if (active.length) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'data-filter-clear';
    clear.textContent = clearLabel;
    clear.addEventListener('click', () => { active.forEach(({ input }) => reset(input)); onChange?.(); controls[0]?.input?.focus(); });
    container.append(clear);
  }
}
