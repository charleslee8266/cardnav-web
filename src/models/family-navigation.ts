import { autoCategories } from '../shop-auto-category.js';
import { gatewayFamilyPath, gatewayProviderSlug, shopCategoryPath, officialPricePathname, leaderboardFamilyPath } from './routes.js';
import { productForAutoCategory, quickPlanSearchTermForSlug, quickPlanProducts, quickProductDefaultPlan, defaultOfficialPriceSlug } from './product-catalog.js';

/** Route lookup for persisted family identities and currently published catalog entries. */
export function createFamilyNavigation(gatewayFamilies: string[], shopCategories: string[]) {
  const gateways = new Set(gatewayFamilies.map(gatewayProviderSlug));
  const shops = new Set(shopCategories.map(category => productForAutoCategory(category)?.id ?? category));
  return (family: string | null) => {
    const id = family ? gatewayProviderSlug(family) : '';
    return {
      gatewayPath: id && gateways.has(id) ? gatewayFamilyPath(id) : null,
      shopPath: id && shops.has(id)
        ? quickPlanSearchTermForSlug(id) ? shopCategoryPath(id) : `/market?${new URLSearchParams({ q: `autocat: ${id}` })}`
        : null,
    };
  };
}

/** Catalog links for a known persisted family; no model-name inference. */
export function familyRelatedPaths(family: string | null) {
  const id = family ? gatewayProviderSlug(family) : '';
  const product = quickPlanProducts.find(product => product.gateway?.id === id);
  const defaultPlan = product ? quickProductDefaultPlan(product) : null;
  const category = autoCategories.find(category => category.id === id);
  const officialSlug = defaultOfficialPriceSlug(id);
  return {
    name: product?.gateway?.name ?? category?.label ?? family ?? '',
    gatewayPath: id ? gatewayFamilyPath(id) : null,
    shopPath: defaultPlan ? shopCategoryPath(defaultPlan.slug) : category ? `/market?${new URLSearchParams({ q: `autocat: ${id}` })}` : null,
    officialPath: officialSlug ? officialPricePathname(officialSlug) : null,
    leaderboardPath: id ? leaderboardFamilyPath(id) : null,
  };
}
