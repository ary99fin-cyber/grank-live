function normalizeDomain(value = '') {
  let text = String(value).trim().toLowerCase();
  if (!text) return '';
  text = text.replace(/^https?:\/\//, '').replace(/^www\./, '');
  return text.split('/')[0].split(':')[0].replace(/\.$/, '');
}

function hostnameFromResult(result = {}) {
  const direct = normalizeDomain(result.domain || '');
  if (direct) return direct;
  try {
    return normalizeDomain(new URL(result.link).hostname);
  } catch {
    return '';
  }
}

function domainMatches(result, targetDomain) {
  const host = hostnameFromResult(result);
  const target = normalizeDomain(targetDomain);
  if (!host || !target) return false;
  return host === target || host.endsWith(`.${target}`);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export async function fetchRankSnapshot() {
  const apiKey = process.env.SEARCHAPI_KEY;
  const query = (process.env.TARGET_QUERY || '').trim();
  const targetDomain = normalizeDomain(process.env.TARGET_DOMAIN || '');
  const device = (process.env.SERP_DEVICE || 'mobile').trim().toLowerCase();
  const country = (process.env.SERP_COUNTRY || 'id').trim().toLowerCase();
  const language = (process.env.SERP_LANGUAGE || 'id').trim().toLowerCase();
  const location = (process.env.SERP_LOCATION || '').trim();
  const requestedNum = Number.parseInt(process.env.SERP_NUM_RESULTS || '100', 10);
  const num = clamp(Number.isFinite(requestedNum) ? requestedNum : 100, 1, 100);

  if (!apiKey) throw new Error('SEARCHAPI_KEY belum diisi di Vercel.');
  if (!query) throw new Error('TARGET_QUERY belum diisi di Vercel.');
  if (!targetDomain) throw new Error('TARGET_DOMAIN belum diisi di Vercel.');

  const params = new URLSearchParams({
    engine: 'google_rank_tracking',
    q: query,
    device,
    gl: country,
    hl: language,
    num: String(num)
  });
  if (location) params.set('location', location);

  const response = await fetch(`https://www.searchapi.io/api/v1/search?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json'
    },
    cache: 'no-store'
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`SearchAPI mengembalikan respons non-JSON (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || payload?.error || `HTTP ${response.status}`;
    throw new Error(`SearchAPI error: ${detail}`);
  }

  const organic = Array.isArray(payload?.organic_results) ? payload.organic_results : [];
  const match = organic.find((item) => domainMatches(item, targetDomain)) || null;
  const createdAt = payload?.search_metadata?.created_at || new Date().toISOString();

  return {
    provider: 'searchapi.io',
    query,
    domain: targetDomain,
    device: device.toUpperCase(),
    country: country.toUpperCase(),
    language,
    location: location || null,
    requestedNum: num,
    resultsChecked: organic.length,
    found: Boolean(match),
    position: match ? Number(match.position) : null,
    resultUrl: match?.link || null,
    resultTitle: match?.title || null,
    checkedAt: createdAt,
    searchId: payload?.search_metadata?.id || null,
    searchParameters: payload?.search_parameters || null,
    sample: organic.slice(0, 5).map((item) => ({
      position: item.position,
      domain: hostnameFromResult(item),
      title: item.title || null
    }))
  };
}
