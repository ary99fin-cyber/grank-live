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

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return json(res, 401, { ok: false, error: 'Unauthorized' });
  }

  const supabase = getSupabaseAdmin();
  const fallbackQuery = (process.env.TARGET_QUERY || '').trim();
  const fallbackDomain = (process.env.TARGET_DOMAIN || '').trim().toLowerCase();
  const fallbackDevice = (process.env.SERP_DEVICE || 'mobile').toUpperCase();
  const fallbackCountry = (process.env.SERP_COUNTRY || 'id').toUpperCase();
  const syncTime = new Date().toISOString();

  try {
    const snapshot = await fetchRankSnapshot();
    const dataHour = hourBucket(snapshot.checkedAt);

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
    if (historyError) throw historyError;

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
    if (statusError) throw statusError;

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

    if (fallbackQuery && fallbackDomain) {
      await supabase.from('rank_status').upsert({
        query: fallbackQuery,
        domain: fallbackDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
        device: fallbackDevice,
        country: fallbackCountry,
        status: 'error',
        last_checked_at: syncTime,
        provider: 'searchapi.io',
        message
      }, { onConflict: 'query,domain,device,country' });
    }

    return json(res, 500, { ok: false, error: message });
  }
}
