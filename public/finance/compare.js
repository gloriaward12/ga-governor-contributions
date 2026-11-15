/* Compare the field: Keisha for Governor against other committees on the metrics that matter, from the same filings. Metrics are
   computed from field.json (rebuilt with every filing); comparison sets are saved with the team's views. */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt$ = v => v == null ? '—' : (v < 0 ? '-' : '') + '$' + Math.round(Math.abs(v)).toLocaleString();
const fmtK = v => v == null ? '—' : v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'K' : fmt$(v);
const pct = v => v == null ? '—' : (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%';
const fmtN = v => v == null ? '—' : Math.round(v).toLocaleString();
const EPOCH = Date.UTC(2025, 0, 1); const dayStr = d => { const t = new Date(EPOCH + d * 86400000); return `${String(t.getUTCMonth() + 1).padStart(2, '0')}/${String(t.getUTCDate()).padStart(2, '0')}/${t.getUTCFullYear()}`; };
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(() => t.style.display = 'none', 2200); };
const HOME = 100663;
let FIELD, C = { sel: [100663, 103524, 100035, 101091, 102576, 101067], indexed: false };
const monthLabel = k => { const y = Math.floor(k / 12), m = k % 12; return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }); };
function metrics(c) {
  const monthly = Object.entries(c.monthly || {}).map(([k, v]) => [+k, v]).sort((a, b) => a[0] - b[0]);
  const spend = Object.entries(c.monthlySpend || {}).map(([k, v]) => [+k, v]).sort((a, b) => a[0] - b[0]);
  const lastK = monthly.length ? monthly[monthly.length - 1][0] : null; const last3 = monthly.filter(([k]) => lastK && k > lastK - 3);
  const sl = spend.length ? spend[spend.length - 1][0] : null; const full = spend.filter(([k]) => sl && k < sl).slice(-3); const burn = full.length ? full.reduce((s, [, v]) => s + v, 0) / full.length : (spend.length ? spend[spend.length - 1][1] : 0);
  const b = c.bands || {}; const sums = b.sums || [0, 0, 0, 0]; const tot = sums.reduce((s, v) => s + v, 0) || 1;
  const nonSelf = Math.max(0, c.gross - (c.selfFunding || 0));
  return {
    id: c.id, name: c.committee, cand: c.cand, short: c.short, party: c.party, gross: c.gross, net: c.net, self: c.selfFunding || 0, nonSelf, inkind: c.inkind,
    small: sums[0] / tot, mid: sums[1] / tot, large: (sums[2] + sums[3]) / tot, maxTier: sums[3] / tot, inState: c.gaShare, donors: c.donors, avg: c.avgGift, median: c.medianGift,
    per90: last3.reduce((s, [, v]) => s + v, 0), spark: monthly.slice(-6), spent: c.spent, burn, coh: c.cashOnHand ?? null, runway: c.cashOnHand != null && burn > 0 ? c.cashOnHand / burn : null, lastDay: c.lastDay, lastMonths: last3.map(([k]) => monthLabel(k)),
  };
}
const ROWS = [
  ['Gross raised', 'gross', fmtK, 1], ['Net of refunds', 'net', fmtK, 1], ['Raised excluding self-funding', 'nonSelf', fmtK, 1], ['Self-funding', 'self', fmtK, 1], ['Last 90 days raised', 'per90', fmtK, 1],
  ['Named donors', 'donors', fmtN, 1], ['Average gift', 'avg', fmt$, 1], ['Median gift', 'median', fmt$, 1],
  ['Small-dollar share (< $100)', 'small', pct, 1], ['$1,000+ share of dollars', 'large', pct, 1], ['$8,400+ share of dollars', 'maxTier', pct, 1], ['In-state share (itemized)', 'inState', pct, 1],
  ['Spent to date', 'spent', fmtK, 1], ['Burn, avg of last 3 full months', 'burn', fmtK, 1], ['Cash on hand (registry)', 'coh', fmtK, 1], ['Runway at current burn (months)', 'runway', v => v == null ? '—' : v.toFixed(1), 1],
];
function spark(m, max) { if (!m.length) return ''; const W = 90, H = 24, bw = W / m.length; return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${m.map(([k, v], i) => `<rect x="${i * bw + 1}" y="${H - (v / max) * (H - 2) - 1}" width="${bw - 2}" height="${(v / max) * (H - 2)}" fill="#3b6fd6" rx="1"><title>${monthLabel(k)}: ${fmtK(v)}</title></rect>`).join('')}</svg>`; }
function render() {
  const all = FIELD.candidates.filter(c => c.gross > 0).sort((a, b) => b.gross - a.gross); const byId = new Map(all.map(c => [c.id, c]));
  const sel = C.sel.map(id => byId.get(id)).filter(Boolean).map(metrics); const home = sel.find(m => m.id === HOME) || sel[0];
  const sparkMax = Math.max(1, ...sel.flatMap(m => m.spark.map(x => x[1])));
  const cell = (m, key, f) => { const v = m[key]; if (C.indexed && home && m.id !== home.id) { const h = home[key]; if (typeof v === 'number' && typeof h === 'number' && h) { const idx = v / h * 100; return `<td class="num ${idx > 100 ? 'up' : idx < 100 ? 'dn' : ''}"><b>${Math.round(idx)}</b><div class="small muted">${f(v)}</div></td>`; } } return `<td class="num">${f(v)}</td>`; };
  const sets = segments().filter(s => s.kind === 'compare');
  $('#main').innerHTML = `
  <h1>Compare the field</h1><p class="sub">Keisha for Governor against other committees on the same filings, as extracted ${esc(FIELD.extractedAsOf)}. Pick two to six; toggle to index everything to the campaign (= 100).</p>
  <div class="bar" style="margin:0 0 10px;align-items:center;flex-wrap:wrap;gap:8px"><span id="who"></span><span style="flex:1"></span>
    <select class="btn" id="add"><option value="">+ add a committee</option>${all.filter(c => !C.sel.includes(c.id)).map(c => `<option value="${c.id}">${esc(c.short)} · ${esc(c.party)} · ${fmtK(c.gross)}</option>`).join('')}</select>
    ${sets.length ? `<select class="btn" id="sets"><option value="">Saved sets (${sets.length})</option>${sets.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>` : ''}
    <button class="btn" id="saveset">Save this set</button><button class="btn ${C.indexed ? 'primary' : ''}" id="idx">${C.indexed ? 'Indexed: campaign = 100' : 'Index to campaign'}</button><button class="btn" id="csv">CSV</button><button class="btn" id="snap">Comparison snapshot</button></div>
  <div class="segs">${sel.map(m => `<button class="seg on" data-rm="${m.id}" title="remove">${esc(m.short)} <span class="muted">${esc(m.party)}</span> ✕</button>`).join('')}</div>
  <div class="card"><div class="tw"><table class="cmp"><thead><tr><th>Metric</th>${sel.map(m => `<th class="num ${m.id === HOME ? 'home' : ''}"><b>${esc(m.short)}</b><div class="small muted">${esc(m.party)} · through ${dayStr(m.lastDay)}</div></th>`).join('')}</tr></thead><tbody>
    <tr><td>Trajectory · last 6 months raised<div class="small muted">each committee to its own scale</div></td>${sel.map(m => `<td class="num">${spark(m.spark, Math.max(1, ...m.spark.map(x => x[1])))}<div class="small muted">${m.lastMonths[0] || ''}–${m.lastMonths[m.lastMonths.length - 1] || ''}</div></td>`).join('')}</tr>
    ${ROWS.map(([label, key, f]) => `<tr><td>${label}</td>${sel.map(m => cell(m, key, f)).join('')}</tr>`).join('')}
  </tbody></table></div>
  <div class="note">Shares use the Commission’s itemized and unitemized bands as filed; “$1,000+ share” is the concentration measure (top-1%/top-10% by donor would need every committee’s itemized file and is on the list). Cash on hand is the registry balance where the Commission publishes one; runway divides it by the average of the last three full months of spending. First-time-donor share needs prior-cycle data and is not shown. Self-funding is separated so a self-funded committee can be read fairly.</div></div>
  <div id="snapout"></div>`;
  userChip($('#who'));
  $('#add').addEventListener('change', e => { if (e.target.value && C.sel.length < 6) { C.sel.push(+e.target.value); render(); } else if (C.sel.length >= 6) toast('Six at most, for a readable table'); });
  $('#main').querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { if (C.sel.length <= 2) return toast('Keep at least two'); C.sel = C.sel.filter(id => id !== +b.dataset.rm); render(); }));
  $('#idx').addEventListener('click', () => { C.indexed = !C.indexed; render(); });
  $('#saveset').addEventListener('click', () => { const name = prompt('Name this comparison set', sel.map(m => m.short).join(' · ')); if (!name) return; segmentSave({ kind: 'compare', name, filter: { sel: C.sel } }); toast('Set saved'); render(); });
  const ss = $('#sets'); if (ss) ss.addEventListener('change', e => { const s = segments().find(x => x.id === e.target.value); if (s) { C.sel = s.filter.sel; render(); } });
  $('#csv').addEventListener('click', () => { const out = [['Metric', ...sel.map(m => m.short)], ...ROWS.map(([label, key]) => [label, ...sel.map(m => m[key] == null ? '' : m[key])])]; dlText(`compare-field-${new Date().toISOString().slice(0, 10)}.csv`, out.map(r => r.map(csvQ).join(',')).join('\n')); });
  $('#snap').addEventListener('click', () => {
    const h = home; const others = sel.filter(m => m.id !== h.id); const rank = (key, desc = true) => [...sel].sort((a, b) => desc ? (b[key] || 0) - (a[key] || 0) : (a[key] || 0) - (b[key] || 0)).findIndex(m => m.id === h.id) + 1;
    const lead = others.sort((a, b) => b.nonSelf - a.nonSelf)[0];
    const text = [`Comparison snapshot · filings through ${dayStr(h.lastDay)} · ${sel.length} committees.`,
      `${h.name} has raised ${fmtK(h.gross)} gross (${fmtK(h.nonSelf)} excluding self-funding), ranking ${rank('nonSelf')} of ${sel.length} on money raised from others; ${lead ? `${lead.short} leads that measure at ${fmtK(lead.nonSelf)}` : ''}.`,
      `Its donor base is the ${rank('donors') === 1 ? 'largest' : `#${rank('donors')}`} in the set at ${fmtN(h.donors)} named donors with a median gift of ${fmt$(h.median)}; ${pct(h.small)} of its dollars came in gifts under $100, against ${others.map(m => `${m.short} ${pct(m.small)}`).join(', ')}.`,
      `${pct(h.inState)} of its itemized dollars are from Georgia (${others.map(m => `${m.short} ${pct(m.inState)}`).join(', ')}).`,
      `Last 90 days: ${fmtK(h.per90)} raised; burn ${fmtK(h.burn)} a month; ${h.coh != null ? `cash on hand ${fmtK(h.coh)}, about ${h.runway != null ? h.runway.toFixed(1) : '—'} months of runway at that burn` : 'no registry balance published'}.`,
      `Largest-gift dependence: ${pct(h.maxTier)} of dollars from $8,400+ gifts (${others.map(m => `${m.short} ${pct(m.maxTier)}`).join(', ')}).`].join(' ');
    $('#snapout').innerHTML = `<div class="card" style="margin-top:12px"><h3>Comparison snapshot <button class="btn xs" id="cp">Copy</button> <button class="btn xs" id="pr">Print</button></h3><p id="snaptext" style="padding:0 14px 12px">${esc(text)}</p></div>`;
    $('#cp').addEventListener('click', () => navigator.clipboard.writeText(text + '\n\n' + ROWS.map(([label, key, f]) => label + ': ' + sel.map(m => `${m.short} ${f(m[key])}`).join(' · ')).join('\n')).then(() => toast('Snapshot copied')));
    $('#pr').addEventListener('click', () => { const w = window.open('', '_blank'); w.document.write(`<title>Comparison snapshot</title><style>body{font:12.5px/1.5 -apple-system,Segoe UI,Arial,sans-serif;margin:32px;max-width:900px}h1{font-size:17px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border-bottom:1px solid #ddd;padding:5px 8px;text-align:right}th:first-child,td:first-child{text-align:left}th{font-size:11px;color:#555}</style><h1>Compare the field · ${esc(dayStr(h.lastDay))}</h1><p>${esc(text)}</p><table><thead><tr><th>Metric</th>${sel.map(m => `<th>${esc(m.short)}</th>`).join('')}</tr></thead><tbody>${ROWS.map(([label, key, f]) => `<tr><td>${label}</td>${sel.map(m => `<td>${f(m[key])}</td>`).join('')}</tr>`).join('')}</tbody></table><p style="color:#777;font-size:11px">Source: Georgia Government Transparency & Campaign Finance Commission filings via Governor Pulse. Internal.</p>`); w.document.close(); w.print(); });
    $('#snapout').scrollIntoView({ behavior: 'smooth' });
  });
}
(async () => { try { FIELD = await (await fetch('/data/field.json', { cache: 'no-cache' })).json(); await gpSync(); render(); } catch (e) { $('#main').innerHTML = `<div class="loading">Could not load: ${esc(e.message)}</div>`; } })();
