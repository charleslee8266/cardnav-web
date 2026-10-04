import { autoCategoryIdsForFilter } from './models/product-catalog.js';

/** Category selection is an independent constraint, combined with keyword search. */
export function matchesShopCategory(productCategory: string | undefined, selectedCategory: string): boolean {
  return !selectedCategory || autoCategoryIdsForFilter(selectedCategory).includes(productCategory || 'other');
}
