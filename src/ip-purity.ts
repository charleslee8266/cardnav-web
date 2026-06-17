/**
 * 文件说明: 提供 IP 纯净度检测的地址校验、外部数据源调用、结果聚合和评分逻辑。
 */

export type IpPuritySourceStatus = 'ok' | 'failed' | 'skipped';
export type IpPurityRiskLevel = 'clean' | 'watch' | 'risk' | 'blocked';

export type IpPuritySourceResult = {
  name: string;
  status: IpPuritySourceStatus;
  summaryKey: string;
  summaryParams?: Record<string, string | number | boolean | string[]>;
};

export type IpPurityFlag = {
  key: string;
  verdict: 'clean' | 'risk' | 'unknown';
};

export type IpPurityReport = {
  ok: true;
  ip: string;
  score: number;
  riskLevel: IpPurityRiskLevel;
  summaryKey: string;
  summaryParams: {
    score: number;
    riskLevel: IpPurityRiskLevel;
    signalKeys: string[];
  };
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
  messageKey: string;
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
    return { ok: false, code: 'INVALID_IP', messageKey: 'missingIp' };
  }
  if (input.includes(':')) {
    return { ok: false, code: 'UNSUPPORTED_IP_VERSION', messageKey: 'ipv6Unsupported' };
  }
  if (!IPV4_PATTERN.test(input)) {
    return { ok: false, code: 'INVALID_IP', messageKey: 'invalidIp' };
  }

  const segments = input.split('.').map(Number);
  if (segments.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
    return { ok: false, code: 'INVALID_IP', messageKey: 'invalidIp' };
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
    return { ok: false, code: 'PRIVATE_OR_RESERVED_IP', messageKey: 'privateOrReservedIp' };
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
      messageKey: 'allSourcesFailed',
    };
  }

  const score = calculatePurityScore({ ipApi, ipApiIs, abuseIpDb, greyNoise });
  const riskLevel = score >= 85 ? 'clean' : score >= 65 ? 'watch' : score >= 40 ? 'risk' : 'blocked';
  const checkedAt = new Date().toISOString();

  const profile = {
    country: pickText(ipApiIs.data?.location?.country, ipApi.data?.country),
    region: pickText(ipApiIs.data?.location?.state, ipApi.data?.regionName),
    city: pickText(ipApiIs.data?.location?.city, ipApi.data?.city),
    isp: pickText(ipApi.data?.isp, abuseIpDb.data?.data?.isp),
    organization: pickText(ipApiIs.data?.asn?.org, ipApi.data?.org, ipApiIs.data?.company?.name),
    asn: pickText(normalizeAsn(ipApiIs.data?.asn?.asn), normalizeAsn(extractAsnFromIpApi(ipApi.data?.as))),
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
    makeSignal('proxy', ipApi.data?.proxy || ipApiIs.data?.is_proxy),
    makeSignal('vpn', ipApiIs.data?.is_vpn),
    makeSignal('tor', ipApiIs.data?.is_tor),
    makeSignal('hosting', ipApi.data?.hosting || ipApiIs.data?.is_datacenter),
    makeSignal('abuse', hasAbuseSignal(abuseIpDb.data)),
    makeSignal('scanner', greyNoise.data?.noise),
  ];

  const sourceResults: IpPuritySourceResult[] = [
    toSourceResult('ip-api', ipApi.data ? 'ok' : 'failed', summarizeIpApi(ipApi.data)),
    toSourceResult('ipapi.is', ipApiIs.data ? 'ok' : 'failed', summarizeIpApiIs(ipApiIs.data)),
    toSourceResult('AbuseIPDB', abuseIpDb.status, summarizeAbuseIpDb(abuseIpDb.data, abuseIpDb.status)),
    toSourceResult('GreyNoise', greyNoise.status, summarizeGreyNoise(greyNoise.data, greyNoise.status)),
  ];
  const riskSignalKeys = signals.filter(signal => signal.verdict === 'risk').map(signal => signal.key);

  return {
    ok: true,
    ip: normalizedIp,
    score,
    riskLevel,
    summaryKey: riskSignalKeys.length === 0 ? 'summary.clean' : 'summary.withRisks',
    summaryParams: {
      score,
      riskLevel,
      signalKeys: riskSignalKeys.slice(0, 3),
    },
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

function makeSignal(key: string, value: boolean | undefined): IpPurityFlag {
  if (value === true) {
    return { key, verdict: 'risk' };
  }
  if (value === false) {
    return { key, verdict: 'clean' };
  }
  return { key, verdict: 'unknown' };
}

function summarizeIpApi(data: IpApiResult | null) {
  if (!data || data.status !== 'success') {
    return { summaryKey: 'source.noUsableResult' };
  }
  const values = [data.country, data.regionName, data.city, data.isp].filter(isNonEmptyString);
  return values.length > 0
    ? { summaryKey: 'source.values', summaryParams: { values } }
    : { summaryKey: 'source.basicNetworkInfo' };
}

function summarizeIpApiIs(data: IpApiIsResult | null) {
  if (!data) {
    return { summaryKey: 'source.noUsableResult' };
  }
  const parts = [
    data.location?.country,
    data.asn?.type,
    data.is_proxy ? 'proxy' : '',
    data.is_vpn ? 'vpn' : '',
    data.is_tor ? 'tor' : '',
  ].filter(isNonEmptyString);
  return parts.length > 0
    ? { summaryKey: 'source.values', summaryParams: { values: parts } }
    : { summaryKey: 'source.typeAndRiskTags' };
}

function summarizeAbuseIpDb(data: AbuseIpDbResult | null, status: IpPuritySourceStatus) {
  if (status === 'skipped') {
    return { summaryKey: 'source.skipped' };
  }
  if (!data?.data) {
    return { summaryKey: 'source.noUsableResult' };
  }
  return abuseSummary(data);
}

function summarizeGreyNoise(data: GreyNoiseResult | null, status: IpPuritySourceStatus) {
  if (status === 'skipped') {
    return { summaryKey: 'source.skipped' };
  }
  if (!data) {
    return { summaryKey: 'source.noUsableResult' };
  }
  return greyNoiseSummary(data);
}

function abuseSummary(data: AbuseIpDbResult | null) {
  const score = Number(data?.data?.abuseConfidenceScore || 0);
  const reports = Number(data?.data?.totalReports || 0);
  return { summaryKey: 'source.abuseIpDb', summaryParams: { score, reports } };
}

function greyNoiseSummary(data: GreyNoiseResult | null | undefined) {
  if (!data) {
    return { summaryKey: 'source.noUsableResult' };
  }
  const parts = [
    data.classification ? `classification: ${data.classification}` : '',
    typeof data.noise === 'boolean' ? (data.noise ? 'noise' : 'not-noise') : '',
    typeof data.riot === 'boolean' ? (data.riot ? 'riot' : 'not-riot') : '',
  ].filter(isNonEmptyString);
  return parts.length > 0
    ? { summaryKey: 'source.values', summaryParams: { values: parts } }
    : { summaryKey: 'source.communityIntel' };
}

function hasAbuseSignal(data: AbuseIpDbResult | null) {
  const score = Number(data?.data?.abuseConfidenceScore || 0);
  const reports = Number(data?.data?.totalReports || 0);
  return score > 0 || reports > 0;
}

function toSourceResult(
  name: string,
  status: IpPuritySourceStatus,
  summary: Pick<IpPuritySourceResult, 'summaryKey' | 'summaryParams'>,
): IpPuritySourceResult {
  return { name, status, ...summary };
}

function pickText(...values: Array<string | undefined>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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
