/**
 * 文件说明: 提供 IP 纯净度检测的地址校验、外部数据源调用、结果聚合和评分逻辑。
 */

export type IpPuritySourceStatus = 'ok' | 'failed' | 'skipped';
export type IpPurityRiskLevel = 'clean' | 'watch' | 'risk' | 'blocked';

export type IpPuritySourceResult = {
  name: string;
  status: IpPuritySourceStatus;
  summary: string;
};

export type IpPurityFlag = {
  key: string;
  label: string;
  verdict: 'clean' | 'risk' | 'unknown';
  detail: string;
};

export type IpPurityReport = {
  ok: true;
  ip: string;
  score: number;
  riskLevel: IpPurityRiskLevel;
  summary: string;
  checkedAt: string;
  profile: {
    country: string;
    region: string;
    city: string;
    isp: string;
    organization: string;
    asn: string;
    networkType: string;
    latitude: number | null;
    longitude: number | null;
  };
  signals: IpPurityFlag[];
  sourceResults: IpPuritySourceResult[];
};

type IpPurityFailureCode =
  | 'INVALID_IP'
  | 'UNSUPPORTED_IP_VERSION'
  | 'PRIVATE_OR_RESERVED_IP'
  | 'CHECK_FAILED';

export type IpPurityFailure = {
  ok: false;
  code: IpPurityFailureCode;
  message: string;
};

type EnvLike = Record<string, string | undefined>;

type IpApiResult = {
  status: string;
  country?: string;
  regionName?: string;
  city?: string;
  lat?: number;
  lon?: number;
  isp?: string;
  org?: string;
  as?: string;
  proxy?: boolean;
  hosting?: boolean;
  mobile?: boolean;
};

type IpApiIsResult = {
  location?: {
    country?: string;
    state?: string;
    city?: string;
  };
  company?: {
    name?: string;
    type?: string;
    abuser_score?: string | number;
  };
  asn?: {
    asn?: number | string;
    org?: string;
    type?: string;
  };
  is_proxy?: boolean;
  is_vpn?: boolean;
  is_tor?: boolean;
  is_datacenter?: boolean;
  is_abuser?: boolean;
};

type AbuseIpDbResult = {
  data?: {
    abuseConfidenceScore?: number;
    totalReports?: number;
    usageType?: string;
    isp?: string;
  };
};

type GreyNoiseResult = {
  noise?: boolean;
  riot?: boolean;
  classification?: string;
};

const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function validateIpv4Input(rawValue: unknown): { ok: true; ip: string } | IpPurityFailure {
  const input = String(rawValue ?? '').trim();
  if (!input) {
    return { ok: false, code: 'INVALID_IP', message: '请输入要检测的 IP 地址。' };
  }
  if (input.includes(':')) {
    return { ok: false, code: 'UNSUPPORTED_IP_VERSION', message: '当前只支持 IPv4 纯净度检测，IPv6 暂不支持。' };
  }
  if (!IPV4_PATTERN.test(input)) {
    return { ok: false, code: 'INVALID_IP', message: 'IP 格式不正确，请输入正确地址，例如 8.8.8.8。' };
  }

  const segments = input.split('.').map(Number);
  if (segments.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
    return { ok: false, code: 'INVALID_IP', message: 'IP 格式不正确，请输入正确地址，例如 8.8.8.8。' };
  }

  const [first, second] = segments;
  const isPrivate =
    first === 10 ||
    first === 127 ||
    first === 0 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 0) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224;

  if (isPrivate) {
    return { ok: false, code: 'PRIVATE_OR_RESERVED_IP', message: '只支持检测公网 IPv4，私网、回环和保留地址不能检测纯净度。' };
  }

  return { ok: true, ip: segments.join('.') };
}

export async function createIpPurityReport(ip: string, env: EnvLike = process.env): Promise<IpPurityReport | IpPurityFailure> {
  const ipValidation = validateIpv4Input(ip);
  if (!ipValidation.ok) {
    return ipValidation;
  }

  const normalizedIp = ipValidation.ip;
  const [ipApi, ipApiIs, abuseIpDb, greyNoise] = await Promise.all([
    fetchJson<IpApiResult>(`http://ip-api.com/json/${normalizedIp}?fields=status,country,regionName,city,lat,lon,isp,org,as,proxy,hosting,mobile`),
    fetchJson<IpApiIsResult>(`https://api.ipapi.is/?q=${normalizedIp}`),
    fetchAbuseIpDb(normalizedIp, env),
    fetchGreyNoise(normalizedIp, env),
  ]);

  if (!ipApi.data && !ipApiIs.data && !abuseIpDb.data && !greyNoise.data) {
    return {
      ok: false,
      code: 'CHECK_FAILED',
      message: '纯净度检测失败，当前外部数据源都没有返回可用结果，请稍后重试。',
    };
  }

  const score = calculatePurityScore({ ipApi, ipApiIs, abuseIpDb, greyNoise });
  const riskLevel = score >= 85 ? 'clean' : score >= 65 ? 'watch' : score >= 40 ? 'risk' : 'blocked';
  const checkedAt = new Date().toISOString();

  const profile = {
    country: pickText(ipApiIs.data?.location?.country, ipApi.data?.country, '未识别'),
    region: pickText(ipApiIs.data?.location?.state, ipApi.data?.regionName, '未识别'),
    city: pickText(ipApiIs.data?.location?.city, ipApi.data?.city, '未识别'),
    isp: pickText(ipApi.data?.isp, abuseIpDb.data?.data?.isp, '未识别'),
    organization: pickText(ipApiIs.data?.asn?.org, ipApi.data?.org, ipApiIs.data?.company?.name, '未识别'),
    asn: pickText(normalizeAsn(ipApiIs.data?.asn?.asn), normalizeAsn(extractAsnFromIpApi(ipApi.data?.as)), '未识别'),
    networkType: pickText(
      ipApiIs.data?.asn?.type,
      ipApiIs.data?.company?.type,
      abuseIpDb.data?.data?.usageType,
      ipApi.data?.hosting ? 'hosting' : undefined,
      'unknown',
    ),
    latitude: Number.isFinite(ipApi.data?.lat) ? Number(ipApi.data?.lat) : null,
    longitude: Number.isFinite(ipApi.data?.lon) ? Number(ipApi.data?.lon) : null,
  };

  const signals: IpPurityFlag[] = [
    makeSignal('proxy', '代理痕迹', ipApi.data?.proxy || ipApiIs.data?.is_proxy, '未发现明显代理标记', '检测到代理或匿名网络特征'),
    makeSignal('vpn', 'VPN 痕迹', ipApiIs.data?.is_vpn, '未发现明确 VPN 标记', '检测到 VPN 标记'),
    makeSignal('tor', 'Tor 痕迹', ipApiIs.data?.is_tor, '未发现 Tor 标记', '检测到 Tor 网络出口'),
    makeSignal('hosting', '机房 / 数据中心', ipApi.data?.hosting || ipApiIs.data?.is_datacenter, '更像家宽或普通运营商出口', '更像机房、云服务或数据中心网络'),
    makeSignal('abuse', '滥用记录', hasAbuseSignal(abuseIpDb.data), abuseIpDb.data ? '当前滥用记录较低或未命中' : '获取失败', abuseIpDb.data ? abuseSummary(abuseIpDb.data) : '获取失败'),
    makeSignal('scanner', '扫描器噪声', greyNoise.data?.noise, greyNoise.data ? '未发现明显互联网扫描器噪声' : '获取失败', greyNoiseSummary(greyNoise.data)),
  ];

  const sourceResults: IpPuritySourceResult[] = [
    toSourceResult('ip-api', ipApi.data ? 'ok' : 'failed', summarizeIpApi(ipApi.data)),
    toSourceResult('ipapi.is', ipApiIs.data ? 'ok' : 'failed', summarizeIpApiIs(ipApiIs.data)),
    toSourceResult('AbuseIPDB', abuseIpDb.status, summarizeAbuseIpDb(abuseIpDb.data, abuseIpDb.status)),
    toSourceResult('GreyNoise', greyNoise.status, summarizeGreyNoise(greyNoise.data, greyNoise.status)),
  ];

  return {
    ok: true,
    ip: normalizedIp,
    score,
    riskLevel,
    summary: buildSummary(score, riskLevel, signals),
    checkedAt,
    profile,
    signals,
    sourceResults,
  };
}

async function fetchAbuseIpDb(ip: string, env: EnvLike) {
  const apiKey = String(env.ABUSEIPDB_API_KEY || '').trim();
  if (!apiKey) {
    return { status: 'skipped' as const, data: null };
  }
  return fetchJson<AbuseIpDbResult>(
    `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
    {
      Accept: 'application/json',
      Key: apiKey,
    },
  );
}

async function fetchGreyNoise(ip: string, env: EnvLike) {
  const apiKey = String(env.GREYNOISE_API_KEY || '').trim();
  if (!apiKey) {
    return { status: 'skipped' as const, data: null };
  }
  return fetchJson<GreyNoiseResult>(`https://api.greynoise.io/v3/community/${encodeURIComponent(ip)}`, {
    Accept: 'application/json',
    key: apiKey,
  });
}

async function fetchJson<T>(url: string, headers?: Record<string, string>) {
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      return { status: 'failed' as const, data: null };
    }
    return {
      status: 'ok' as const,
      data: await response.json() as T,
    };
  } catch {
    return { status: 'failed' as const, data: null };
  }
}

function calculatePurityScore(sources: {
  ipApi: { data: IpApiResult | null };
  ipApiIs: { data: IpApiIsResult | null };
  abuseIpDb: { data: AbuseIpDbResult | null };
  greyNoise: { data: GreyNoiseResult | null };
}) {
  let penalty = 0;
  if (sources.ipApi.data?.proxy) penalty += 30;
  if (sources.ipApi.data?.hosting) penalty += 18;
  if (sources.ipApiIs.data?.is_proxy) penalty += 28;
  if (sources.ipApiIs.data?.is_vpn) penalty += 22;
  if (sources.ipApiIs.data?.is_tor) penalty += 45;
  if (sources.ipApiIs.data?.is_datacenter) penalty += 18;
  if (sources.ipApiIs.data?.is_abuser) penalty += 25;

  const abuserScore = parseAbuserScore(sources.ipApiIs.data?.company?.abuser_score);
  if (abuserScore >= 80) penalty += 24;
  else if (abuserScore >= 50) penalty += 14;
  else if (abuserScore >= 20) penalty += 8;

  const abuseScore = Number(sources.abuseIpDb.data?.data?.abuseConfidenceScore || 0);
  if (abuseScore >= 75) penalty += 42;
  else if (abuseScore >= 35) penalty += 24;
  else if (abuseScore > 0) penalty += 10;

  const totalReports = Number(sources.abuseIpDb.data?.data?.totalReports || 0);
  if (totalReports >= 20) penalty += 10;
  else if (totalReports > 0) penalty += 4;

  const classification = String(sources.greyNoise.data?.classification || '').toLowerCase();
  if (classification === 'malicious') penalty += 30;
  else if (classification === 'benign') penalty += 6;

  if (sources.greyNoise.data?.noise) penalty += 14;
  if (sources.greyNoise.data?.riot) penalty = Math.max(0, penalty - 8);

  return Math.max(0, Math.min(100, 100 - penalty));
}

function buildSummary(score: number, riskLevel: IpPurityRiskLevel, signals: IpPurityFlag[]) {
  const riskSignals = signals.filter(signal => signal.verdict === 'risk').map(signal => signal.label);
  const label = {
    clean: '高纯净',
    watch: '可用但需留意',
    risk: '风险偏高',
    blocked: '高风险',
  }[riskLevel];

  if (riskSignals.length === 0) {
    return `纯净度 ${score}/100，${label}。当前没有看到明显代理、Tor、滥用或扫描器强风险信号。`;
  }

  return `纯净度 ${score}/100，${label}。主要注意 ${riskSignals.slice(0, 3).join('、')}。`;
}

function makeSignal(
  key: string,
  label: string,
  value: boolean | undefined,
  cleanDetail: string,
  riskDetail: string,
): IpPurityFlag {
  if (value === true) {
    return { key, label, verdict: 'risk', detail: riskDetail };
  }
  if (value === false) {
    return { key, label, verdict: 'clean', detail: cleanDetail };
  }
  return { key, label, verdict: 'unknown', detail: cleanDetail };
}

function summarizeIpApi(data: IpApiResult | null) {
  if (!data || data.status !== 'success') {
    return '未返回可用结果';
  }
  return [data.country, data.regionName, data.city, data.isp].filter(Boolean).join(' / ') || '已返回基础网络信息';
}

function summarizeIpApiIs(data: IpApiIsResult | null) {
  if (!data) {
    return '未返回可用结果';
  }
  const parts = [
    data.location?.country,
    data.asn?.type,
    data.is_proxy ? 'proxy' : '',
    data.is_vpn ? 'vpn' : '',
    data.is_tor ? 'tor' : '',
  ].filter(Boolean);
  return parts.join(' / ') || '已返回类型与风险标签';
}

function summarizeAbuseIpDb(data: AbuseIpDbResult | null, status: IpPuritySourceStatus) {
  if (status === 'skipped') {
    return '-';
  }
  if (!data?.data) {
    return '-';
  }
  return abuseSummary(data);
}

function summarizeGreyNoise(data: GreyNoiseResult | null, status: IpPuritySourceStatus) {
  if (status === 'skipped') {
    return '-';
  }
  if (!data) {
    return '-';
  }
  return greyNoiseSummary(data);
}

function abuseSummary(data: AbuseIpDbResult | null) {
  const score = Number(data?.data?.abuseConfidenceScore || 0);
  const reports = Number(data?.data?.totalReports || 0);
  return `置信分 ${score}，报告数 ${reports}`;
}

function greyNoiseSummary(data: GreyNoiseResult | null | undefined) {
  if (!data) {
    return '未返回可用结果';
  }
  const parts = [
    data.classification ? `分类 ${data.classification}` : '',
    typeof data.noise === 'boolean' ? (data.noise ? 'noise' : 'not-noise') : '',
    typeof data.riot === 'boolean' ? (data.riot ? 'riot' : 'not-riot') : '',
  ].filter(Boolean);
  return parts.join(' / ') || '已返回社区情报结果';
}

function hasAbuseSignal(data: AbuseIpDbResult | null) {
  const score = Number(data?.data?.abuseConfidenceScore || 0);
  const reports = Number(data?.data?.totalReports || 0);
  return score > 0 || reports > 0;
}

function toSourceResult(name: string, status: IpPuritySourceStatus, summary: string): IpPuritySourceResult {
  return { name, status, summary };
}

function pickText(...values: Array<string | undefined>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function normalizeAsn(value: string | number | undefined) {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  const text = String(value).trim().toUpperCase();
  return text.startsWith('AS') ? text : `AS${text}`;
}

function extractAsnFromIpApi(value: string | undefined) {
  if (!value) return '';
  const matched = value.match(/AS\d+/i);
  return matched?.[0] || '';
}

function parseAbuserScore(value: string | number | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value <= 1 ? value * 100 : value;
  }
  if (typeof value !== 'string') return 0;
  const matched = value.match(/(\d+(?:\.\d+)?)/);
  if (!matched) return 0;
  const parsed = Number(matched[1]);
  if (!Number.isFinite(parsed)) return 0;
  return parsed <= 1 ? parsed * 100 : parsed;
}
