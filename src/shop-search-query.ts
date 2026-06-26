/**
 * 文件说明: 解析并匹配卡网商品页高级搜索查询，供商品筛选与快速搜索复用。
 */
import { parse, test, type LiqeQuery } from 'liqe';

export type ShopSearchRow = {
  productName: string;
  categoryName?: string;
  siteText?: string;
};

export type ShopSearchFieldOptions = {
  matchCategory: boolean;
  matchMerchant: boolean;
};

export type ShopSearchQuery =
  | { mode: 'empty' }
  | { mode: 'advanced'; raw: string; ast: LiqeQuery }
  | { mode: 'invalid'; raw: string };

function normalizeSearchText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function quoteSearchToken(value: string) {
  return `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`;
}

function flushSearchToken(token: string) {
  if (!token) return '';
  if (/^[\p{L}\p{N}_-]+$/u.test(token)) return token;
  return quoteSearchToken(token);
}

function normalizeAdvancedSearchOperators(value: string) {
  let result = '';
  let token = '';
  let quote: '"' | "'" | null = null;

  const flushTokenToResult = () => {
    result += flushSearchToken(token);
    token = '';
  };

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const previous = value[index - 1] || '';
    const next = value[index + 1] || '';

    if ((character === '"' || character === "'") && previous !== '\\') {
      quote = quote === character ? null : character;
      result += character;
      continue;
    }

    if (!quote && character === '|') {
      flushTokenToResult();
      result += ' OR ';
      continue;
    }

    if (!quote && character === '-' && (!previous || /\s|\(/u.test(previous)) && next) {
      flushTokenToResult();
      result += ' NOT ';
      while (/\s/u.test(value[index + 1] || '')) {
        index += 1;
      }
      continue;
    }

    if (!quote && /[\s()]/u.test(character)) {
      flushTokenToResult();
      result += character;
      continue;
    }

    if (quote) {
      result += character;
    } else {
      token += character;
    }
  }

  flushTokenToResult();
  return normalizeSearchText(result);
}

export function prepareShopSearchQuery(value: string) {
  return normalizeAdvancedSearchOperators(value);
}

export function buildShopSearchQuery(value: string): ShopSearchQuery {
  const raw = prepareShopSearchQuery(value);
  if (!raw) return { mode: 'empty' };
  try {
    return { mode: 'advanced', raw, ast: parse(raw) };
  } catch (_error) {
    return { mode: 'invalid', raw };
  }
}

export function buildShopSearchRow(row: ShopSearchRow, options: ShopSearchFieldOptions) {
  const searchable: Record<string, string> = {
    productName: row.productName,
  };
  if (options.matchCategory && row.categoryName) {
    searchable.categoryName = row.categoryName;
  }
  if (options.matchMerchant && row.siteText) {
    searchable.siteText = row.siteText;
  }
  return searchable;
}

export function matchesShopSearchQuery(
  row: ShopSearchRow,
  query: ShopSearchQuery,
  options: ShopSearchFieldOptions,
) {
  if (query.mode === 'empty') return true;
  if (query.mode === 'invalid') return false;
  const searchable = buildShopSearchRow(row, options);
  return test(query.ast, searchable);
}
