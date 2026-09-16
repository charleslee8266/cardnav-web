/**
 * 文件说明: 按类型提供全部可关联赞赏的公开站点，供前端按名称或网址筛选。
 */
import type { APIRoute } from 'astro';
import { SupportError } from '../../../support/EasyPay.js';
import { getSupportStore } from '../../../support/SupportStore.js';
import { supportKind, failure, json, parameters } from '../../../support/http.js';

export const GET: APIRoute = async ({ url, request }) => {
  try {
    const params = parameters(url.search);
    const kind = supportKind(params.kind);
    if (kind === 'person') throw new SupportError('selectMerchantKind');
    return json({ ok: true, sites: await getSupportStore().sites(kind) });
  } catch (error) { return failure(error, request.headers.get('x-cardnav-locale') || 'zh'); }
};
