import { createProviderLabel } from '../data-display.js';
import { gatewayProviderSlug } from './routes.js';

export function bindProviderSelection(scope: string, select: (provider: string) => void) {
  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-select-provider]') : null;
    if (!button || button.dataset.providerScope !== scope) return;
    event.preventDefault(); event.stopImmediatePropagation();
    select(button.dataset.selectProvider || '');
  }, { capture: true });
}

export function createProviderSelection(name: string, scope: string) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'model-provider-select';
  button.dataset.selectProvider = gatewayProviderSlug(name); button.dataset.providerScope = scope;
  button.append(createProviderLabel(name));
  return button;
}
