import { createModelFamilyLabel } from '../data-display.js';
import { gatewayProviderSlug } from './routes.js';

/** Selection belongs to the owning table, including labels cloned into tooltips. */
export function bindFamilySelection(scope: string, select: (family: string) => void) {
  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-select-family]') : null;
    if (!button || button.dataset.familyScope !== scope) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    select(button.dataset.selectFamily || '');
  }, { capture: true });
}

export function createModelFamilySelection(name: string, scope: string) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'model-family-select';
  button.dataset.selectFamily = gatewayProviderSlug(name); button.dataset.familyScope = scope;
  button.append(createModelFamilyLabel(name));
  return button;
}
