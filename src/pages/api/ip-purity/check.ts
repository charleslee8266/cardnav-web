/**
 * 文件说明: 提供公开站点 IP 纯净度检测接口，只接受公网 IPv4 并返回聚合后的纯净度结果。
 */
import type { APIRoute } from 'astro';
import { createIpPurityReport } from '../../../ip-purity.js';

export const GET: APIRoute = async ({ url, request, clientAddress }) => {
  const rawIp = url.searchParams.get('ip') || pickClientIp(request, clientAddress);
  const result = await createIpPurityReport(rawIp);
  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 400,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};

function pickClientIp(request: Request, clientAddress: string | undefined) {
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const firstForwardedIp = forwardedFor
    .split(',')
    .map(value => value.trim())
    .find(Boolean);
  const realIp = request.headers.get('x-real-ip') || '';
  return firstForwardedIp || realIp || clientAddress || '';
}
