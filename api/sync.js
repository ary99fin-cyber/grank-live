import { getSupabaseAdmin } from '../lib/supabase.js';
import { fetchRankSnapshot } from '../lib/searchapi.js';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(payload));
}

function isAuthorized(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.headers.authorization === `Bearer ${expected}`;
}

function hourBucket(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

function cleanDomain(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return json(res, 401, { ok: false, error: 'Unauthorized' });
  }

  const fallbackQuery = (process.env.TARGET_QUERY || '').trim();
  const fallbackDomain = cleanDomain(process.env.TARGET_DOMAIN || '');
  const fallbackDevice = (process.env.SERP_DEVICE || 'mobile').toUpperCase();
  const fallbackCountry = (process.env.SERP_COUNTRY || 'id').toUpperCase();
  const syncTime = new Date().toISOString();

  let supabase = null;
  let stage = 'initializing';

  try {
    stage = 'supabase_init';
    supabase = getSupabaseAdmin();

    stage = 'searchapi_request';
    const snapshot = await fetchRankSnapshot();
    const dataHour = hourBucket(snapshot.checkedAt);

    stage = 'save_history';
    const historyRow = {
      query: snapshot.query,
      domain: snapshot.domain,
      device: snapshot.device,
      country: snapshot.country,
      data_hour: dataHour,
      position: snapshot.position,
      found: snapshot.found,
      result_url: snapshot.resultUrl,
      result_title: snapshot.resultTitle,
      results_checked: snapshot.resultsChecked,
      provider: snapshot.provider,
      synced_at: syncTime
    };

    const { error: historyError } = await supabase
      .from('rank_history')
      .upsert(historyRow, { onConflict: 'query,domain,device,country,data_hour' });
    if (historyError) throw new Error(`Supabase rank_history: ${historyError.message}`);

    stage = 'save_status';
    const message = snapshot.found
      ? `${snapshot.domain} ditemukan di posisi #${snapshot.position}.`
      : `${snapshot.domain} tidak ditemukan pada ${snapshot.resultsChecked || snapshot.requestedNum} hasil organic yang diperiksa.`;

    const statusRow = {
      query: snapshot.query,
      domain: snapshot.domain,
      device: snapshot.device,
      country: snapshot.country,
      status: snapshot.found ? 'ok' : 'not_found',
      last_checked_at: syncTime,
      last_data_hour: dataHour,
      last_position: snapshot.position,
      found: snapshot.found,
      last_result_url: snapshot.resultUrl,
      last_result_title: snapshot.resultTitle,
      results_checked: snapshot.resultsChecked,
      provider: snapshot.provider,
      message
    };

    const { error: statusError } = await supabase
      .from('rank_status')
      .upsert(statusRow, { onConflict: 'query,domain,device,country' });
    if (statusError) throw new Error(`Supabase rank_status: ${statusError.message}`);

    return json(res, 200, {
      ok: true,
      target: {
        query: snapshot.query,
        domain: snapshot.domain,
        device: snapshot.device,
        country: snapshot.country,
        location: snapshot.location
      },
      found: snapshot.found,
      position: snapshot.position,
      result_url: snapshot.resultUrl,
      results_checked: snapshot.resultsChecked,
      checked_at: snapshot.checkedAt,
      provider: snapshot.provider,
      sample_top_5: snapshot.sample
    });
  } catch (error) {
    const message = error?.message || String(error);
    console.error('SERP sync failed', { stage, message });

    if (supabase && fallbackQuery && fallbackDomain) {
      try {
        await supabase.from('rank_status').upsert({
          query: fallbackQuery,
          domain: fallbackDomain,
          device: fallbackDevice,
          country: fallbackCountry,
          status: 'error',
          last_checked_at: syncTime,
          provider: 'searchapi.io',
          message: `[${stage}] ${message}`
        }, { onConflict: 'query,domain,device,country' });
      } catch {}
    }

    return json(res, 500, {
      ok: false,
      stage,
      error: message
    });
  }
}
