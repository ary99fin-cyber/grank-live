import { getSupabaseAdmin } from '../lib/supabase.js';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(payload));
}

function normalizeDomain(value = '') {
  return String(value).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const query = (process.env.TARGET_QUERY || '').trim();
    const domain = normalizeDomain(process.env.TARGET_DOMAIN || '');
    const device = (process.env.SERP_DEVICE || 'mobile').toUpperCase();
    const country = (process.env.SERP_COUNTRY || 'id').toUpperCase();
    const location = (process.env.SERP_LOCATION || '').trim() || null;

    if (!query || !domain) {
      throw new Error('TARGET_QUERY/TARGET_DOMAIN belum diisi di Vercel Environment Variables.');
    }

    const supabase = getSupabaseAdmin();

    const [{ data: history, error: historyError }, { data: status, error: statusError }] = await Promise.all([
      supabase
        .from('rank_history')
        .select('data_hour,position,found,result_url,result_title,results_checked,provider,synced_at')
        .eq('query', query)
        .eq('domain', domain)
        .eq('device', device)
        .eq('country', country)
        .order('data_hour', { ascending: false })
        .limit(168),
      supabase
        .from('rank_status')
        .select('*')
        .eq('query', query)
        .eq('domain', domain)
        .eq('device', device)
        .eq('country', country)
        .maybeSingle()
    ]);

    if (historyError) throw historyError;
    if (statusError) throw statusError;

    const ordered = (history || []).slice().reverse();
    const ranked = ordered.filter((row) => row.found === true && Number.isFinite(Number(row.position)));
    const latest = ordered.at(-1) || null;
    const latestRankedIndex = latest?.found ? ranked.length - 1 : -1;
    const previousRanked = latestRankedIndex > 0 ? ranked[latestRankedIndex - 1] : null;

    return json(res, 200, {
      ok: true,
      target: { query, domain, device, country, location },
      latest,
      previous_ranked: previousRanked,
      status: status || null,
      history: ordered
    });
  } catch (error) {
    return json(res, 500, { ok: false, error: error?.message || String(error) });
  }
}
