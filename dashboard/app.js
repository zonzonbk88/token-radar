// Token Launch Radar — renders window.RADAR (written by main.ts beside this
// page) as a sortable, filterable board with a detail view per protocol.
// Views are hash routes so each one can be opened directly:
//   #/            the board        #f/<category>  the board, filtered
//   #p/<slug>     one protocol's detail view
'use strict';

const R = window.RADAR;
const rows = R.rows;
const bySlug = new Map(rows.map((r) => [r.slug, r]));
const $ = (id) => document.getElementById(id);

const money = (n) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
};
const pct = (x) => {
  if (x === null) return '<span class="flat">—</span>';
  const v = (x * 100).toFixed(1);
  return `<span class="${x > 0.0005 ? 'pos' : x < -0.0005 ? 'neg' : 'flat'}">${x > 0 ? '+' : ''}${v}%</span>`;
};
const age = (d) => (d === null ? '—' : d >= 730 ? `${(d / 365).toFixed(1)}y` : d >= 60 ? `${Math.round(d / 30)}mo` : `${d}d`);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function fillStats() {
  const watch = rows.filter((r) => r.watchlist).length;
  const total = rows.reduce((a, r) => a + r.implied_value_usd, 0);
  $('stats').innerHTML = [
    ['Protocols scanned', R.scanned],
    ['On the board', rows.length],
    ['Watchlist covered', `${watch} / ${watch}`],
    ['Combined implied value', money(total)],
    ['Snapshot date', R.as_of],
  ]
    .map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`)
    .join('');
  $('method').innerHTML = `<b>How the ranking works.</b> ${esc(R.model.summary)} Global peer multiple: ${R.model.global_multiple}x TVL.`;
}

function fillFilters() {
  const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();
  $('cat').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
  const chains = [...new Set(rows.flatMap((r) => r.chains))].sort();
  $('chain').innerHTML = '<option value="">All chains</option>' + chains.map((c) => `<option>${esc(c)}</option>`).join('');
}

const SORTS = {
  rank: (a, b) => a.rank - b.rank,
  tvl: (a, b) => b.tvl_usd - a.tvl_usd,
  growth: (a, b) => (b.change_7d ?? -Infinity) - (a.change_7d ?? -Infinity),
  age: (a, b) => (b.age_days ?? -1) - (a.age_days ?? -1),
  multiple: (a, b) => b.implied_value_usd / b.tvl_usd - a.implied_value_usd / a.tvl_usd,
};

function currentList() {
  const q = $('q').value.trim().toLowerCase();
  const cat = $('cat').value;
  const chain = $('chain').value;
  const watchOnly = $('watch').checked;
  return rows
    .filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q) || r.slug.includes(q)) &&
        (!cat || r.category === cat) &&
        (!chain || r.chains.includes(chain)) &&
        (!watchOnly || r.watchlist),
    )
    .sort(SORTS[$('sort').value]);
}

function renderBoard() {
  const list = currentList();
  $('count').textContent = `${list.length} of ${rows.length} protocols shown`;
  $('rows').innerHTML = list
    .map(
      (r) => `<tr data-slug="${r.slug}">
        <td class="num rank">${r.rank}</td>
        <td><span class="name">${esc(r.name)}</span>${r.watchlist ? '<span class="flag">Watchlist</span>' : ''}<br><span class="slug">${r.slug}</span></td>
        <td>${esc(r.category ?? '—')}</td>
        <td class="num">${money(r.tvl_usd)}</td>
        <td class="num">${pct(r.change_7d)}</td>
        <td class="num"><b>${money(r.implied_value_usd)}</b></td>
        <td class="num">${(r.implied_value_usd / r.tvl_usd).toFixed(2)}x</td>
        <td class="num">${age(r.age_days)}</td>
        <td><a class="open" href="#p/${r.slug}">Detail →</a></td>
      </tr>`,
    )
    .join('');
}

function bar(label, mult, max, note) {
  const w = Math.max(2, Math.min(100, (mult / max) * 100));
  return `<p><b>${label}: ${mult.toFixed(3)}x</b> — ${note}</p><div class="bar"><i style="width:${w}%"></i></div>`;
}

function renderDetail(slug) {
  const r = bySlug.get(slug);
  if (!r) return false;
  const steps = r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('');
  $('detail').innerHTML = `
    <div class="detail-head">
      <h2>${esc(r.name)}</h2><span class="slug">${r.slug}</span>
      ${r.watchlist ? '<span class="flag">Watchlist</span>' : ''}
    </div>
    <p class="count">Rank #${r.rank} of ${rows.length} · ${esc(r.category ?? 'Uncategorised')} · ${r.chains.map(esc).join(', ') || 'chain unrecorded'}</p>
    <div class="kv-grid">
      <div class="kv"><span>Implied value</span><b>${money(r.implied_value_usd)}</b><small>the model's claim for a launch at today's record</small></div>
      <div class="kv"><span>TVL</span><b>${money(r.tvl_usd)}</b><small>sealed snapshot, ${R.as_of}</small></div>
      <div class="kv"><span>7d TVL change</span><b>${r.change_7d === null ? '—' : `${(r.change_7d * 100).toFixed(1)}%`}</b><small>momentum input to the model</small></div>
      <div class="kv"><span>Tokenless age</span><b>${age(r.age_days)}</b><small>tracked since ${r.listed_at ?? 'an unrecorded date'}, no token recorded</small></div>
    </div>
    <section class="panel">
      <h3>How this value is derived</h3>
      ${bar('Peer multiple', r.peer_multiple, 3, `the median market-cap / TVL of tokenised ${esc(r.category ?? 'peer')} protocols in the snapshot, applied to this TVL`)}
      ${bar('Momentum', r.growth_mult, 1.5, 'the seven-day TVL change, clamped at +/-30% and weighted 1.5')}
      ${bar('Maturity', r.maturity_mult, 1.25, 'up to +25% for two years run with no token recorded')}
      <p>TVL ${money(r.tvl_usd)} x ${r.peer_multiple.toFixed(3)} x ${r.growth_mult.toFixed(3)} x ${r.maturity_mult.toFixed(3)} = <b>${money(r.implied_value_usd)}</b> implied value.</p>
    </section>
    <section class="panel">
      <h3>Farm plan</h3>
      <ol class="steps">${steps}</ol>
    </section>`;
  return true;
}

function route() {
  const hash = location.hash || '#/';
  const detail = hash.match(/^#p\/(.+)$/);
  const filtered = hash.match(/^#f\/(.+)$/);
  if (detail && renderDetail(decodeURIComponent(detail[1]))) {
    $('board-view').hidden = true;
    $('detail-view').hidden = false;
    window.scrollTo(0, 0);
    return;
  }
  $('detail-view').hidden = true;
  $('board-view').hidden = false;
  if (filtered) {
    const cat = decodeURIComponent(filtered[1]);
    if ([...$('cat').options].some((o) => o.value === cat)) $('cat').value = cat;
  }
  renderBoard();
}

fillStats();
fillFilters();
for (const id of ['q', 'cat', 'chain', 'sort', 'watch']) {
  $(id).addEventListener('input', renderBoard);
  $(id).addEventListener('change', renderBoard);
}
$('rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-slug]');
  if (tr && !e.target.closest('a')) location.hash = `#p/${tr.dataset.slug}`;
});
window.addEventListener('hashchange', route);
route();
