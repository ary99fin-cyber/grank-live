const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date) + ' WIB';
}

function setAlert(message = '') {
  const el = $('alert');
  el.textContent = message;
  el.classList.toggle('hidden', !message);
}

function rankedHistory(history = []) {
  return history.filter((x) => x?.found === true && Number.isFinite(Number(x.position)));
}

function drawChart(history) {
  const ranked = rankedHistory(history);
  const canvas = $('rankChart');
  const empty = $('emptyChart');
  const ctx = canvas.getContext('2d');
  const cssWidth = Math.max(canvas.clientWidth, 320);
  const cssHeight = Math.min(420, Math.max(260, cssWidth * 0.36));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (!ranked.length) {
    canvas.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  canvas.classList.remove('hidden');
  empty.classList.add('hidden');

  const pad = { l: 44, r: 18, t: 20, b: 38 };
  const w = cssWidth - pad.l - pad.r;
  const h = cssHeight - pad.t - pad.b;
  const positions = ranked.map((x) => Number(x.position));
  const min = Math.max(1, Math.floor(Math.min(...positions) - 1));
  const max = Math.max(min + 2, Math.ceil(Math.max(...positions) + 1));
  const xAt = (i) => pad.l + (ranked.length === 1 ? w / 2 : (i / (ranked.length - 1)) * w);
  const yAt = (p) => pad.t + ((p - min) / (max - min)) * h;

  ctx.font = '12px system-ui';
  ctx.fillStyle = '#93a0b5';
  ctx.strokeStyle = '#263149';
  ctx.lineWidth = 1;

  for (let i = 0; i <= 5; i++) {
    const p = min + ((max - min) * i / 5);
    const y = yAt(p);
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(cssWidth - pad.r, y);
    ctx.stroke();
    ctx.fillText(p.toFixed(0), 8, y + 4);
  }

  ctx.strokeStyle = '#72e1a6';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ranked.forEach((point, i) => {
    const x = xAt(i);
    const y = yAt(Number(point.position));
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const last = ranked.at(-1);
  const lastX = xAt(ranked.length - 1);
  const lastY = yAt(Number(last.position));
  ctx.fillStyle = '#72e1a6';
  ctx.beginPath();
  ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#93a0b5';
  const firstLabel = new Date(ranked[0].data_hour).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day:'2-digit', month:'short', hour:'2-digit' });
  const lastLabel = new Date(last.data_hour).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day:'2-digit', month:'short', hour:'2-digit' });
  ctx.fillText(firstLabel, pad.l, cssHeight - 10);
  const lastWidth = ctx.measureText(lastLabel).width;
  ctx.fillText(lastLabel, cssWidth - pad.r - lastWidth, cssHeight - 10);
}

async function load() {
  const btn = $('refreshBtn');
  btn.disabled = true;
  btn.textContent = 'Memuat...';
  setAlert('');

  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Gagal mengambil data.');

    $('keyword').textContent = data.target.query;
    $('domain').textContent = data.target.domain;
    $('scope').textContent = `${data.target.device} • ${data.target.country}${data.target.location ? ` • ${data.target.location}` : ''}`;

    const latest = data.latest;
    if (latest) {
      const checked = Number(latest.results_checked || data.status?.results_checked || 0);
      $('resultsChecked').textContent = checked ? `${checked}` : '—';
      $('provider').textContent = `Provider: ${latest.provider || data.status?.provider || '—'}`;
      $('dataHour').textContent = formatDate(latest.data_hour);

      if (latest.found && Number.isFinite(Number(latest.position))) {
        $('position').textContent = '#' + fmt.format(latest.position);
        $('foundInfo').textContent = `Domain ditemukan di hasil organic Google.`;

        const change = $('change');
        if (data.previous_ranked) {
          const diff = Number(data.previous_ranked.position) - Number(latest.position);
          if (Math.abs(diff) < 0.01) {
            change.textContent = 'Tidak berubah';
            change.className = 'change';
          } else if (diff > 0) {
            change.textContent = `↑ naik ${fmt.format(diff)}`;
            change.className = 'change good';
          } else {
            change.textContent = `↓ turun ${fmt.format(Math.abs(diff))}`;
            change.className = 'change bad';
          }
        } else {
          change.textContent = 'Ranking ditemukan';
          change.className = 'change good';
        }

        $('resultTitle').textContent = latest.result_title || '—';
        if (latest.result_url) {
          $('resultLink').textContent = latest.result_url;
          $('resultLink').href = latest.result_url;
          $('resultLink').classList.remove('disabled-link');
        } else {
          $('resultLink').textContent = 'URL tidak tersedia';
          $('resultLink').href = '#';
          $('resultLink').classList.add('disabled-link');
        }
      } else {
        $('position').textContent = checked ? `>${checked}` : '—';
        $('change').textContent = 'Tidak ditemukan';
        $('change').className = 'change bad';
        $('foundInfo').textContent = checked
          ? `Domain tidak ditemukan pada ${checked} hasil organic yang diperiksa.`
          : 'Belum ada hasil SERP.';
        $('resultTitle').textContent = '—';
        $('resultLink').textContent = 'Belum ditemukan';
        $('resultLink').href = '#';
        $('resultLink').classList.add('disabled-link');
      }
    } else {
      $('position').textContent = '—';
      $('change').textContent = 'Belum disinkronkan';
      $('foundInfo').textContent = 'Jalankan workflow GitHub atau /api/sync terlebih dahulu.';
      $('resultsChecked').textContent = '0';
      $('provider').textContent = 'Provider: —';
      $('dataHour').textContent = '—';
      $('resultTitle').textContent = '—';
      $('resultLink').textContent = 'Belum ada';
      $('resultLink').href = '#';
    }

    $('checkedAt').textContent = formatDate(data.status?.last_checked_at);
    $('syncStatus').textContent = data.status?.status || 'waiting';

    if (data.status?.status === 'error') {
      setAlert(`Sinkronisasi terakhir error: ${data.status.message || 'unknown error'}`);
    } else if (data.status?.status === 'not_found') {
      setAlert(data.status.message || 'Domain belum ditemukan pada SERP yang diperiksa.');
    }

    drawChart(data.history || []);
  } catch (err) {
    setAlert(err.message || String(err));
    drawChart([]);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Refresh';
  }
}

$('refreshBtn').addEventListener('click', load);
window.addEventListener('resize', load);
load();
setInterval(load, 60_000);
