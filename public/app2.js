'use strict';
// ===== Governor Pulse v2: spending, donor intelligence, momentum, sectors, county map, brief =====
// This script overrides a few functions from the base page and adds new sections.

const ELECTIONS = [{ key: 'Primary', date: '2026-05-19', label: 'Primary' }, { key: 'Primary Runoff', date: '2026-06-16', label: 'Runoff' }, { key: 'General', date: '2026-11-03', label: 'General' }];
const LIMITS = { 'Primary': 8400, 'Primary Runoff': 4800, 'General': 8400, 'General Runoff': 4800 };
const dayOf = iso => Math.round((new Date(iso + 'T00:00:00Z') - EPOCH) / 86400000);
const fmtPct = (a, b) => b ? ((100 * a / b).toFixed(0) + '%') : '—';
const signed = v => (v > 0 ? '+' : '') + v.toFixed(0) + '%';
let CROSS = null, GEO = null, XSEL = [];

// ---------- charts: grouped bars + event markers ----------
function barsChart(el, series, cats, opts = {}) {
  const W = el.clientWidth || 800, H = opts.h || 260, m = { t: 14, r: 12, b: 34, l: 54 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const grouped = !!opts.grouped;
  const tot = cats.map((_, i) => grouped ? Math.max(...series.map(sr => sr.values[i] || 0)) : series.reduce((s, sr) => s + (sr.values[i] || 0), 0));
  const max = Math.max(1, ...tot);
  const step = niceStep(max / 4); const ymax = Math.ceil(max / step) * step;
  const y = v => m.t + ih - (v / ymax) * ih;
  const bw = iw / cats.length; const pad = Math.min(6, bw * 0.25);
  let g = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g class="grid">`;
  for (let v = 0; v <= ymax; v += step) { g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${opts.fmt ? fmtKn(v) : fmtK(v)}</text>`; }
  g += `</g><line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  cats.forEach((c, i) => {
    const x = m.l + i * bw + pad / 2; const w = Math.max(1, bw - pad);
    if (grouped) {
      const gw = w / series.length;
      series.forEach((sr, si) => { const v = sr.values[i] || 0; if (!v) return; g += `<rect x="${x + si * gw}" y="${y(v)}" width="${Math.max(1, gw - 1)}" height="${Math.max(0, y(0) - y(v))}" fill="${sr.color}" rx="2"/>`; });
    } else {
      let acc = 0;
      series.forEach((sr, si) => { const v = sr.values[i] || 0; if (!v) return; const y1 = y(acc + v), y0 = y(acc); const h = Math.max(0, y0 - y1 - (si > 0 ? 2 : 0)); g += `<rect x="${x}" y="${y1}" width="${w}" height="${h}" fill="${sr.color}" rx="${si === series.length - 1 ? 3 : 0}"/>`; acc += v; });
    }
    const every = Math.max(1, Math.ceil(44 / bw)); if (i % every === 0 || (cats.length <= 8)) g += `<text x="${x + w / 2}" y="${H - 10}" text-anchor="middle">${c}</text>`;
    g += `<rect class="hit" x="${m.l + i * bw}" y="${m.t}" width="${bw}" height="${ih}" fill="transparent" data-i="${i}"/>`;
  });
  if (opts.markers) opts.markers.forEach((mk, mi) => { if (mk.i == null || mk.i < 0 || mk.i >= cats.length) return; const mx = m.l + (mk.i + (mk.frac ?? 0.5)) * bw; g += `<line x1="${mx}" x2="${mx}" y1="${m.t}" y2="${m.t + ih}" stroke="var(--gold)" stroke-dasharray="3 3"/><text x="${mx + 4}" y="${m.t + 10 + (mi % 3) * 12}" style="fill:var(--gold-2);font-weight:600">${esc(mk.label)}</text>`; });
  g += '</svg>'; el.innerHTML = g;
  el.querySelectorAll('rect.hit').forEach(r => { r.addEventListener('mouseenter', () => { const i = +r.dataset.i; showTT(`<b>${esc(cats[i])}</b><br>` + series.map(sr => `${esc(sr.name)}: ${opts.fmt ? opts.fmt(sr.values[i] || 0) : fmt$(sr.values[i] || 0)}`).join('<br>') + (series.length > 1 && !grouped ? `<br>Total: ${opts.fmt ? opts.fmt(tot[i]) : fmt$(tot[i])}` : '') + (opts.extra ? '<br>' + opts.extra(i) : '')); }); r.addEventListener('mouseleave', hideTT); });
}
function lineChart(el, xs, ys, opts = {}) {
  const W = el.clientWidth || 800, H = opts.h || 220, m = { t: 16, r: 30, b: 30, l: 60 }; const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const max = Math.max(1, ...ys); const step = niceStep(max / 4); const ymax = Math.ceil(max / step) * step;
  const y = v => m.t + ih - (v / ymax) * ih; const x = i => m.l + (xs.length > 1 ? i / (xs.length - 1) : 0) * iw;
  let g = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g class="grid">`;
  for (let v = 0; v <= ymax; v += step) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmtK(v)}</text>`;
  g += '</g>';
  const pts = ys.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  g += `<polygon points="${m.l},${y(0)} ${pts} ${x(xs.length - 1)},${y(0)}" fill="var(--s1)" opacity=".08"/>`;
  g += `<polyline points="${pts}" fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round"/>`;
  if (opts.markers && opts.days) opts.markers.forEach((mk, mi) => { let i = opts.days.findIndex(d => d >= mk.day); if (i < 0) { if (opts.days[opts.days.length - 1] < mk.day) return; i = opts.days.length - 1; } const mx = x(i); g += `<line x1="${mx}" x2="${mx}" y1="${m.t}" y2="${m.t + ih}" stroke="var(--gold)" stroke-dasharray="3 3"/><text x="${mx + 4}" y="${m.t + 10 + (mi % 3) * 12}" style="fill:var(--gold-2);font-weight:600">${esc(mk.label)}</text>`; });
  const lab = Math.max(1, Math.floor(xs.length / 8)); xs.forEach((d, i) => { if (i % lab === 0 || i === xs.length - 1) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${d}</text>`; });
  g += `<line id="ch" class="axis" y1="${m.t}" y2="${m.t + ih}" x1="-10" x2="-10"/><circle id="cdot" r="4" fill="var(--s1)" stroke="var(--surface)" stroke-width="2" cx="-10" cy="-10"/>`;
  g += `<rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" class="hit"/></svg>`;
  el.innerHTML = g; const svg = el.querySelector('svg'), ch = svg.querySelector('#ch'), dot = svg.querySelector('#cdot');
  svg.querySelector('.hit').addEventListener('mousemove', e => { const r = svg.getBoundingClientRect(); const px = e.clientX - r.left; const i = Math.max(0, Math.min(xs.length - 1, Math.round((px - m.l) / iw * (xs.length - 1)))); ch.setAttribute('x1', x(i)); ch.setAttribute('x2', x(i)); dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(ys[i])); showTT(`<b>${esc(opts.tipLabel ? opts.tipLabel(i) : xs[i])}</b><br>${opts.name || ''} ${fmt$(ys[i])}`); });
  svg.querySelector('.hit').addEventListener('mouseleave', () => { hideTT(); ch.setAttribute('x1', -10); ch.setAttribute('x2', -10); dot.setAttribute('cx', -10); });
}
function electionMarkersMonthly(kmin) { return ELECTIONS.map(e => { const t = new Date(e.date + 'T00:00:00Z'); const k = t.getUTCFullYear() * 12 + t.getUTCMonth(); return { i: k - kmin, frac: (t.getUTCDate() - 1) / 30, label: e.label }; }); }
function electionMarkersDaily() { return ELECTIONS.map(e => ({ day: dayOf(e.date), label: e.label })); }

// ---------- donor aggregation with runoff splits ----------
function donorAgg() {
  const det = D.det; const ttRet = D.ttIdx['Return Contribution']; const m = new Map();
  const E = DICT.etype; const pri = E.indexOf('Primary'), gen = E.indexOf('General'), pr = E.indexOf('Primary Runoff'), gr = E.indexOf('General Runoff');
  for (const i of SEL) {
    const k = det.dkey[i]; let o = m.get(k);
    if (!o) { o = { k, name: det.name[i], city: det.city[i], state: det.state[i], zip: det.zip[i], occ: det.occ[i], emp: det.emp[i], ctype: det.ctype[i], sector: det.sector[i], n: 0, total: 0, ret: 0, max: 0, first: 1e9, last: -1, pri: 0, gen: 0, pr: 0, gr: 0, other: 0, rows: [] }; m.set(k, o); }
    const a = det.cents[i] / 100; o.rows.push(i);
    const e = det.etype[i];
    if (det.ttype[i] === ttRet) { o.ret += a; o.total += a; if (e === pri) o.pri += a; else if (e === gen) o.gen += a; else if (e === pr) o.pr += a; else if (e === gr) o.gr += a; else o.other += a; }
    else { o.n++; o.total += a; if (a > o.max) o.max = a; if (e === pri) o.pri += a; else if (e === gen) o.gen += a; else if (e === pr) o.pr += a; else if (e === gr) o.gr += a; else o.other += a; }
    const d = det.day[i]; if (d < o.first) o.first = d; if (d > o.last) { o.last = d; if (det.occ[i]) o.occ = det.occ[i]; if (det.emp[i]) o.emp = det.emp[i]; }
  }
  for (const o of m.values()) { o.other += o.pr + o.gr; o.headroom = Math.max(0, LIMITS.Primary - o.pri) + Math.max(0, LIMITS['Primary Runoff'] - o.pr) + Math.max(0, LIMITS.General - o.gen) + Math.max(0, LIMITS['General Runoff'] - o.gr); }
  return [...m.values()];
}

// ---------- momentum + brief ----------
function momentum() {
  const det = D.det, un = D.unit, ttRet = D.ttIdx['Return Contribution'];
  const end = D.maxDay; const win = (a, b) => ({ sum: 0, n: 0, donors: new Set(), a, b });
  const w7 = win(end - 6, end), p7 = win(end - 13, end - 7), w30 = win(end - 29, end), p30 = win(end - 59, end - 30);
  const firstGift = new Map();
  for (let i = 0; i < N; i++) { if (det.ttype[i] === ttRet) continue; const k = det.dkey[i], d = det.day[i]; if (!firstGift.has(k) || firstGift.get(k) > d) firstGift.set(k, d); }
  const add = (w, d, a, k) => { if (d >= w.a && d <= w.b) { w.sum += a; w.n++; if (k != null) w.donors.add(k); } };
  for (let i = 0; i < N; i++) { if (det.ttype[i] === ttRet) continue; const d = det.day[i], a = det.cents[i] / 100, k = det.dkey[i]; add(w7, d, a, k); add(p7, d, a, k); add(w30, d, a, k); add(p30, d, a, k); }
  for (let i = 0; i < UN; i++) { if (un.ttype[i] === ttRet) continue; const d = un.day[i], a = un.cents[i] / 100; add(w7, d, a); add(p7, d, a); add(w30, d, a); add(p30, d, a); }
  let new30 = 0; for (const k of w30.donors) if (firstGift.get(k) >= w30.a) new30++;
  let new30p = 0; for (const k of p30.donors) if (firstGift.get(k) >= p30.a) new30p++;
  const chg = (a, b) => b ? (100 * (a - b) / b) : null;
  return { end, w7, p7, w30, p30, new30, new30p, chg7: chg(w7.sum, p7.sum), chg30: chg(w30.sum, p30.sum), avg30: w30.n ? w30.sum / w30.n : 0, avg30p: p30.n ? p30.sum / p30.n : 0 };
}
function spendStats() {
  const x = D.exp; const n = x.tid.length; const xt = DICT.xttype; const ret = xt.indexOf('Return Expenditure');
  let spent = 0; const monthly = new Map(); let lastDay = -1;
  for (let i = 0; i < n; i++) { if (x.child[i]) continue; const a = x.cents[i] / 100 * (x.xttype[i] === ret ? -1 : 1); spent += a; const k = monthKey(x.day[i]); monthly.set(k, (monthly.get(k) || 0) + a); if (x.day[i] > lastDay) lastDay = x.day[i]; }
  // average burn over the last 3 complete months of spend data
  const keys = [...monthly.keys()].sort((a, b) => a - b); const lastK = keys[keys.length - 1]; const full = keys.filter(k => k < lastK).slice(-3);
  const burn = full.length ? full.reduce((s, k) => s + monthly.get(k), 0) / full.length : (lastK != null ? monthly.get(lastK) : 0);
  const coh = D.meta.cashOnHand; const runway = (coh != null && burn > 0) ? coh / burn : null;
  return { spent, monthly, lastDay, burn, coh, runway, burnMonths: full.map(monthLabel) };
}
function briefText() {
  const det = D.det, un = D.unit, ttRet = D.ttIdx['Return Contribution'];
  let gross = 0, ret = 0, n = 0, small = 0, ga = 0, item = 0; const dk = new Set();
  for (let i = 0; i < N; i++) { const a = det.cents[i] / 100; const t = det.ttype[i]; if (t === ttRet) { ret += a; continue; } if (t !== D.ttIdx['Contribution']) continue; gross += a; n++; dk.add(det.dkey[i]); if (a < 200) small += a; item += a; if (det.state[i] === D.gaIdx) ga += a; }
  for (let i = 0; i < UN; i++) { const a = un.cents[i] / 100; if (un.ttype[i] === ttRet) { ret += a; continue; } gross += a; n++; if (a < 200) small += a; }
  const M = momentum(); const S = spendStats(); const meta = D.meta;
  const ds = donorAggAll(); const maxed = ds.filter(d => d.pri >= LIMITS.Primary || d.gen >= LIMITS.General).length;
  const s = [];
  s.push(`As of ${dayStr(D.maxDay)}, ${meta.committee} has raised ${fmt$(gross + ret)} net of refunds from ${fmtN(n)} contributions and ${fmtN(dk.size)} named donors.`);
  s.push(`The last 30 days brought in ${fmt$(M.w30.sum)}${M.chg30 != null ? ` (${signed(M.chg30)} versus the prior 30 days)` : ''} across ${fmtN(M.w30.n)} gifts, including ${fmtN(M.new30)} first-time donors; the average gift in that window was ${fmt$2(M.avg30)}.`);
  s.push(`${fmtPct(small, gross)} of all dollars came in gifts under $200 and ${fmtPct(ga, item)} of itemized dollars came from Georgia addresses; ${fmtN(maxed)} donors have given the maximum for the primary or the general.`);
  if (S.spent) s.push(`The committee has reported ${fmt$(S.spent)} in spending${S.coh != null ? ` and ${fmt$(S.coh)} cash on hand per the Commission's registry` : ''}${S.runway != null ? `, about ${S.runway.toFixed(1)} months of runway at the recent burn of ${fmt$(S.burn)} per month` : ''}.`);
  return s.join(' ');
}
function donorAggAll() { const save = SEL; SEL = []; for (let i = 0; i < N; i++) if (D.det.ttype[i] === D.ttIdx['Contribution'] || D.det.ttype[i] === D.ttIdx['Return Contribution']) SEL.push(i); const r = donorAgg(); SEL = save; return r; }

// ---------- overview (extended) ----------
function renderOverview(main) {
  BASE.renderOverview(main);
  const M = momentum(); const S = spendStats();
  const filtered = SEL.length + USEL.length !== N + UN;
  const brief = document.createElement('div'); brief.className = 'brief';
  brief.innerHTML = `<div class="brief-h"><h3>Briefing</h3><span class="muted small">Generated from the filings; covers the full committee record regardless of filters.</span><button class="btn" id="printBrief">Print brief</button></div><p>${esc(briefText())}</p>`;
  main.insertBefore(brief, main.firstChild);
  const mom = document.createElement('div'); mom.className = 'card'; mom.style.marginTop = '14px';
  const tile = (l, v, d) => `<div class="tile"><div class="l">${l}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
  mom.innerHTML = `<h3>Momentum</h3><div class="note">Receipts in the most recent windows of the record (through ${dayStr(M.end)}), compared with the window before. Full committee record, not filtered. The most recent days only include gifts large enough to trigger a Two-Business-Day report, so the 7-day figure usually understates.</div>
  <div class="kpis">${tile('Last 7 days', fmt$(M.w7.sum), `${fmtN(M.w7.n)} gifts, ${M.chg7 == null ? 'no prior-week comparison' : signed(M.chg7) + ' vs prior 7 days'}`)}${tile('Last 30 days', fmt$(M.w30.sum), `${fmtN(M.w30.n)} gifts, ${M.chg30 == null ? 'no prior comparison' : signed(M.chg30) + ' vs prior 30 days'}`)}${tile('First-time donors, 30 days', fmtN(M.new30), `${fmtN(M.w30.donors.size - M.new30)} returning; prior 30 days had ${fmtN(M.new30p)} new`)}${tile('Average gift, 30 days', fmt$2(M.avg30), M.avg30p ? `prior 30 days ${fmt$2(M.avg30p)}` : '')}${S.spent ? tile('Recent burn', fmt$(S.burn) + '/mo', S.burnMonths.length ? `average of ${S.burnMonths.join(', ')}` : 'latest month') : ''}${S.runway != null ? tile('Runway', S.runway.toFixed(1) + ' months', `cash on hand ${fmt$(S.coh)} ÷ recent burn`) : ''}</div>`;
  main.insertBefore(mom, main.children[2]);
  $('#printBrief').addEventListener('click', () => { try { window.print(); } catch (e) { toast('Printing is not available in this viewer'); } });
  // redraw the cumulative chart with election markers
  const det = D.det, un = D.unit, ttRet = D.ttIdx['Return Contribution'];
  const daily = new Map(); for (const i of SEL) { const a = det.cents[i] / 100; daily.set(det.day[i], (daily.get(det.day[i]) || 0) + a); } for (const i of USEL) { const a = un.cents[i] / 100; daily.set(un.day[i], (daily.get(un.day[i]) || 0) + a); }
  const days = [...daily.keys()].sort((a, b) => a - b); const cum = []; let acc = 0; const dl = []; for (const d of days) { acc += daily.get(d); cum.push(acc); dl.push(dayStr(d).slice(0, 5) + '/' + dayStr(d).slice(8)); }
  if (days.length && $('#c2')) lineChart($('#c2'), dl, cum, { name: 'Cumulative', tipLabel: i => dayStr(days[i]), days, markers: electionMarkersDaily() });
}

// ---------- spending ----------
let xSort = { k: 'day', dir: -1 }, xPage = 0, xQ = '', xPurpose = '', xShowChildren = true;
function applyExp() {
  const x = D.exp; XSEL = []; const n = x.tid.length; const s = state; const q = xQ.toLowerCase();
  for (let i = 0; i < n; i++) {
    if (!xShowChildren && x.child[i]) continue;
    const d = x.day[i]; if (s.from !== null && d < s.from) continue; if (s.to !== null && d > s.to) continue;
    if (xPurpose && x.cat[i] !== +xPurpose) continue;
    if (q) { const blob = (DICT.payee[x.payee[i]] + '|' + DICT.purpose[x.purpose[i]] + '|' + DICT.xdesc[x.xdesc[i]] + '|' + DICT.pcity[x.pcity[i]] + '|' + DICT.pstate[x.pstate[i]] + '|' + DICT.via[x.via[i]]).toLowerCase(); if (!blob.includes(q)) continue; }
    XSEL.push(i);
  }
}
function vendorAgg() {
  // resolve reimbursements / credit-card parents to their end recipients when children exist
  const x = D.exp; const hasKids = new Set(); for (const i of XSEL) if (x.child[i]) hasKids.add(x.tid[i]);
  const ret = DICT.xttype.indexOf('Return Expenditure'); const m = new Map();
  for (const i of XSEL) { if (!x.child[i] && hasKids.has(x.tid[i])) continue; const k = x.payee[i]; let o = m.get(k); if (!o) { o = { k, label: DICT.payee[k] || '(unitemized)', n: 0, total: 0, city: DICT.pcity[x.pcity[i]], state: DICT.pstate[x.pstate[i]], purposes: new Map() }; m.set(k, o); } const a = x.cents[i] / 100 * (x.xttype[i] === ret ? -1 : 1); o.n++; o.total += a; const p = DICT.cat[x.cat[i]]; o.purposes.set(p, (o.purposes.get(p) || 0) + a); }
  return [...m.values()].map(o => ({ ...o, top: [...o.purposes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '' })).sort((a, b) => b.total - a.total);
}
function renderSpending(main) {
  applyExp();
  const x = D.exp; const ret = DICT.xttype.indexOf('Return Expenditure'); const S = spendStats();
  let spent = 0, nParents = 0, inState = 0, outState = 0, ga = DICT.pstate.indexOf('GA');
  const purposes = new Map(); const monthly = new Map();
  for (const i of XSEL) { if (x.child[i]) continue; const a = x.cents[i] / 100 * (x.xttype[i] === ret ? -1 : 1); spent += a; nParents++; const p = DICT.cat[x.cat[i]]; purposes.set(p, (purposes.get(p) || 0) + a); const k = monthKey(x.day[i]); monthly.set(k, (monthly.get(k) || 0) + a); if (x.pstate[i] === ga) inState += a; else if (x.pstate[i]) outState += a; }
  // receipts by month (gross contributions, full record) for the raised-vs-spent chart
  const rec = new Map(); const det = D.det, un = D.unit, ttRet = D.ttIdx['Return Contribution'], ttCon = D.ttIdx['Contribution'];
  for (let i = 0; i < N; i++) { if (det.ttype[i] !== ttCon) continue; const k = monthKey(det.day[i]); rec.set(k, (rec.get(k) || 0) + det.cents[i] / 100); }
  for (let i = 0; i < UN; i++) { if (un.ttype[i] !== ttCon) continue; const k = monthKey(un.day[i]); rec.set(k, (rec.get(k) || 0) + un.cents[i] / 100); }
  const keys = [...new Set([...rec.keys(), ...S.monthly.keys()])].sort((a, b) => a - b); const kmin = keys[0], kmax = keys[keys.length - 1];
  const cats = [], R = [], SP = []; for (let k = kmin; k <= kmax; k++) { cats.push(monthLabel(k)); R.push(rec.get(k) || 0); SP.push(S.monthly.get(k) || 0); }
  const vendors = vendorAgg();
  const pur = [...purposes.entries()].map(([label, total]) => ({ k: label, label, total, n: 0 })).sort((a, b) => b.total - a.total);
  for (const p of pur) { p.n = XSEL.filter(i => !x.child[i] && DICT.cat[x.cat[i]] === p.label).length; }
  // table
  const rows = [...XSEL]; const key = xSort.k, dir = xSort.dir;
  const g = (i, k) => k === 'day' ? x.day[i] : k === 'amt' ? x.cents[i] : k === 'payee' ? DICT.payee[x.payee[i]] : k === 'purpose' ? DICT.cat[x.cat[i]] : DICT.pstate[x.pstate[i]];
  rows.sort((a, b) => { const va = g(a, key), vb = g(b, key); if (typeof va === 'number') return (va - vb) * dir || (x.day[b] - x.day[a]); return (va < vb ? -1 : va > vb ? 1 : 0) * dir || (x.day[b] - x.day[a]); });
  const PS = 100; const pages = Math.max(1, Math.ceil(rows.length / PS)); xPage = Math.min(xPage, pages - 1); const page = rows.slice(xPage * PS, (xPage + 1) * PS);
  const th = (k, l, num) => `<th class="${num ? 'num' : ''} ${xSort.k === k ? 'on' : ''}" data-k="${k}">${l}${xSort.k === k ? (xSort.dir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
  const tile = (l, v, d) => `<div class="tile"><div class="l">${l}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
  const raisedNet = D.meta.net;
  main.innerHTML = `
  <div class="kpis">${tile('Spent', fmt$(spent), `${fmtN(nParents)} expenditures${XSEL.length !== x.tid.length ? ' matching filters' : ' reported'}`)}${tile('Cash on hand', S.coh != null ? fmt$(S.coh) : '—', `Commission registry${D.meta.registrySpent != null ? `; registry spend ${fmt$(D.meta.registrySpent)}` : ''}`)}${tile('Recent burn', fmt$(S.burn) + '/mo', S.burnMonths.length ? `average of ${S.burnMonths.join(', ')}` : 'latest month')}${tile('Runway', S.runway != null ? S.runway.toFixed(1) + ' months' : '—', 'cash on hand ÷ recent burn')}${tile('Spent per dollar raised', raisedNet ? '$' + (S.spent / raisedNet).toFixed(2) : '—', `${fmt$(S.spent)} spent of ${fmt$(raisedNet)} raised`)}${tile('Paid to Georgia vendors', fmtPct(inState, inState + outState), `${fmt$(inState)} in state, ${fmt$(outState)} out of state`)}</div>
  <div class="filters" style="padding:12px 0 0;border:0;background:none">
    <div class="f search"><label for="xq">Search payee, purpose or description</label><input id="xq" value="${esc(xQ)}" placeholder="e.g. media, payroll, Stripe"></div>
    <div class="f"><label for="xp">Category</label><select id="xp"><option value="">All categories</option>${DICT.cat.map((p, i) => p ? `<option value="${i}" ${String(i) === xPurpose ? 'selected' : ''}>${esc(p)}</option>` : '').join('')}</select></div>
    <div class="f"><label>&nbsp;</label><label class="small" style="height:32px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="xkids" ${xShowChildren ? 'checked' : ''}> Show card and reimbursement line items</label></div>
    <div class="f"><label>&nbsp;</label><button class="btn" id="xcsv">Copy spending CSV</button></div>
  </div>
  <div class="small muted" style="margin:4px 0 12px">Date range from the main filter bar applies here; the other contribution filters do not. Spending is as filed through ${S.lastDay >= 0 ? dayStr(S.lastDay) : '—'}; the Commission's registry figure may run ahead of the bulk file.</div>
  <div class="grid two">
    <div class="card"><h3>Raised vs. spent by month</h3><div class="note">Gross contributions received against expenditures made, full committee record.</div><div class="legend"><span><i style="background:var(--s1)"></i>Raised</span><span><i style="background:var(--s8)"></i>Spent</span></div><div id="x1"></div></div>
    <div class="card"><h3>Where the money goes</h3><div class="note">Spend category: the committee's reported purpose where it is specific, otherwise derived from the payment description.</div>${hbars(pur.slice(0, 16))}</div>
  </div>
  <div class="grid two" style="margin-top:14px">
    <div class="card"><h3>Top payees</h3><div class="note">Reimbursements and card payments are attributed to the end recipient when the filing itemizes them.</div>
      <div class="tw" style="max-height:520px"><table><thead><tr><th>Payee</th><th>Location</th><th>Mostly for</th><th class="num">Payments</th><th class="num">Total</th></tr></thead><tbody>${vendors.slice(0, 60).map(v => `<tr class="row click" data-q="${esc(v.label)}"><td><b>${esc(v.label)}</b></td><td>${esc(v.city)}${v.state ? ', ' + v.state : ''}</td><td class="small">${esc(v.top)}</td><td class="num">${fmtN(v.n)}</td><td class="num">${fmt$(v.total)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><h3>Expenditure ledger</h3><div class="note">${fmtN(rows.length)} rows. Indented rows are line items behind a card or reimbursement payment.</div>
      <div class="tw" style="max-height:520px"><table><thead><tr>${th('day', 'Date')}${th('payee', 'Payee')}${th('purpose', 'Category')}${th('amt', 'Amount', 1)}<th>Report</th></tr></thead><tbody>${page.map(i => `<tr class="row"><td>${dayStr(x.day[i])}</td><td style="${x.child[i] ? 'padding-left:22px' : ''}">${x.child[i] ? '<span class="muted">↳ </span>' : ''}${esc(DICT.payee[x.payee[i]] || '(unitemized)')}${x.child[i] && DICT.via[x.via[i]] ? `<div class="small muted">via ${esc(DICT.via[x.via[i]])}</div>` : ''}${DICT.xdesc[x.xdesc[i]] ? `<div class="small muted">${esc(DICT.xdesc[x.xdesc[i]])}</div>` : ''}</td><td class="small">${esc(DICT.cat[x.cat[i]])}${DICT.purpose[x.purpose[i]] && DICT.purpose[x.purpose[i]] !== DICT.cat[x.cat[i]] ? `<div class="muted">filed as ${esc(DICT.purpose[x.purpose[i]])}</div>` : ''}${DICT.xsub[x.xsub[i]] && DICT.xsub[x.xsub[i]] !== 'Itemized Expenditure' ? `<div class="muted">${esc(DICT.xsub[x.xsub[i]])}</div>` : ''}</td><td class="num" ${x.xttype[i] === ret ? 'style="color:var(--crit)"' : ''}>${fmt$2(x.cents[i] / 100)}</td><td class="small">${esc(DICT.xreport[x.xreport[i]])}</td></tr>`).join('')}</tbody></table></div>
      <div class="pager"><span>Rows ${fmtN(xPage * PS + 1)}–${fmtN(Math.min(rows.length, (xPage + 1) * PS))} of ${fmtN(rows.length)}</span><span><button class="btn" id="xpp" ${xPage === 0 ? 'disabled' : ''}>‹ Prev</button> <button class="btn" id="xpn" ${xPage >= pages - 1 ? 'disabled' : ''}>Next ›</button></span></div></div>
  </div>
  <div class="src">Expenditures from the Commission's bulk Expenditure files (filing years 2025 and 2026). Cash on hand and registry totals come from PeachFile's candidate registry at build time. Unitemized expenditures are reported without payee detail.</div>`;
  barsChart($('#x1'), [{ name: 'Raised', color: 'var(--s1)', values: R }, { name: 'Spent', color: 'var(--s8)', values: SP }], cats, { grouped: true, h: 280, markers: electionMarkersMonthly(kmin) });
  let t; const deb = f => { clearTimeout(t); t = setTimeout(f, 180); };
  $('#xq').addEventListener('input', () => deb(() => { xQ = $('#xq').value.trim(); xPage = 0; renderSpending(main); $('#xq').focus(); const v = $('#xq').value; $('#xq').setSelectionRange(v.length, v.length); }));
  $('#xp').addEventListener('change', () => { xPurpose = $('#xp').value; xPage = 0; renderSpending(main); });
  $('#xkids').addEventListener('change', () => { xShowChildren = $('#xkids').checked; xPage = 0; renderSpending(main); });
  main.querySelectorAll('th[data-k]').forEach(h => h.addEventListener('click', () => { const k = h.dataset.k; if (xSort.k === k) xSort.dir *= -1; else { xSort.k = k; xSort.dir = (k === 'day' || k === 'amt') ? -1 : 1; } xPage = 0; renderSpending(main); }));
  $('#xpp').addEventListener('click', () => { xPage--; renderSpending(main); }); $('#xpn').addEventListener('click', () => { xPage++; renderSpending(main); });
  main.querySelectorAll('tr.click[data-q]').forEach(r => r.addEventListener('click', () => { xQ = r.dataset.q; xPage = 0; renderSpending(main); }));
  $('#xcsv').addEventListener('click', async () => { const q = s => { s = String(s ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }; const out = [['Transaction Id', 'Line item', 'Date', 'Payee', 'Via', 'Payee Type', 'City', 'State', 'Category', 'Filed purpose', 'Sub Type', 'Type', 'Description', 'Amount', 'Election', 'Report'].join(',')]; for (const i of XSEL) out.push([x.tid[i], x.child[i] ? 'Y' : 'N', dayStr(x.day[i]), DICT.payee[x.payee[i]], DICT.via[x.via[i]], DICT.ptype[x.ptype[i]], DICT.pcity[x.pcity[i]], DICT.pstate[x.pstate[i]], DICT.cat[x.cat[i]], DICT.purpose[x.purpose[i]], DICT.xsub[x.xsub[i]], DICT.xttype[x.xttype[i]], DICT.xdesc[x.xdesc[i]], (x.cents[i] / 100).toFixed(2), DICT.etype[x.etype[i]], DICT.xreport[x.xreport[i]]].map(q).join(',')); try { await navigator.clipboard.writeText(out.join('\n')); toast(`Copied ${fmtN(out.length - 1)} rows as CSV`); } catch (e) { toast('Clipboard blocked by the browser'); } });
}

// ---------- donor intelligence ----------
let hrMin = 1000, hrSort = { k: 'total', dir: -1 }, crossAll = false, intelView = 'headroom';
async function ensureCross() { if (CROSS) return CROSS; const r = await fetch('data/cross.json'); CROSS = await r.json(); return CROSS; }
function renderIntel(main) {
  const ds = donorAgg(); const det = D.det;
  const people = ds.filter(d => d.n > 0 && DICT.ctype[d.ctype] !== 'Non-Candidate Committee' && DICT.ctype[d.ctype] !== 'Candidate / Candidate Committee');
  // headroom
  const hr = people.filter(d => d.total >= hrMin); const key = hrSort.k;
  hr.sort((a, b) => { let va = a[key], vb = b[key]; if (typeof va === 'number') return (va - vb) * hrSort.dir; va = DICT.name[a.name]; vb = DICT.name[b.name]; return (va < vb ? -1 : 1) * hrSort.dir; });
  const totalHeadroom = hr.reduce((s, d) => s + d.headroom, 0);
  const maxedAny = people.filter(d => d.pri >= LIMITS.Primary || d.gen >= LIMITS.General).length;
  const genRoom = people.filter(d => d.pri >= LIMITS.Primary && d.gen < LIMITS.General);
  // cohorts
  const first = new Map(), last = new Map(), gifts = new Map();
  for (const d of ds) { if (!d.n) continue; first.set(d.k, d.first); last.set(d.k, d.last); gifts.set(d.k, d.n); }
  const months = new Map(); const ttRet = D.ttIdx['Return Contribution'];
  for (const i of SEL) { if (det.ttype[i] === ttRet) continue; const k = monthKey(det.day[i]); let o = months.get(k); if (!o) { o = { nw: new Set(), rt: new Set() }; months.set(k, o); } const dk = det.dkey[i]; if (monthKey(first.get(dk)) === k) o.nw.add(dk); else o.rt.add(dk); }
  const mk = [...months.keys()].sort((a, b) => a - b); const kmin = mk[0], kmax = mk[mk.length - 1]; const cats = [], NW = [], RT = [];
  for (let k = kmin; k <= kmax; k++) { const o = months.get(k); cats.push(monthLabel(k)); NW.push(o ? o.nw.size : 0); RT.push(o ? o.rt.size : 0); }
  const end = D.maxDay; const lapsed = ds.filter(d => d.n > 0 && d.last < end - 180 && d.total >= 100).sort((a, b) => b.total - a.total);
  const upgrade = ds.filter(d => d.n >= 3 && d.total < 1000 && d.last >= end - 180).sort((a, b) => b.n - a.n || b.total - a.total);
  // compliance
  const byName = new Map();
  for (const d of ds) { const nk = det.nkey[d.rows[0]]; let o = byName.get(nk); if (!o) { o = { nk, name: d.name, keys: new Set(), pri: 0, gen: 0, pr: 0, gr: 0, total: 0, ctype: d.ctype }; byName.set(nk, o); } o.keys.add(d.k); o.pri += d.pri; o.gen += d.gen; o.pr += d.pr; o.gr += d.gr; o.total += d.total; }
  const over = [...byName.values()].filter(o => DICT.ctype[o.ctype] !== 'Non-Candidate Committee' && (o.pri > LIMITS.Primary + 0.01 || o.gen > LIMITS.General + 0.01 || o.pr > LIMITS['Primary Runoff'] + 0.01 || o.gr > LIMITS['General Runoff'] + 0.01)).sort((a, b) => b.total - a.total);
  const addr = new Map(); const corp = DICT.ctype.indexOf('Corporation / Business / Unregistered Committee');
  for (const i of SEL) { if (det.ttype[i] === ttRet || !det.addr[i]) continue; const k = det.addr[i] + '|' + det.zip[i]; let o = addr.get(k); if (!o) { o = { k, addr: DICT.addr[det.addr[i]], city: DICT.city[det.city[i]], zip: DICT.zip[det.zip[i]], donors: new Set(), corps: new Set(), total: 0 }; addr.set(k, o); } o.donors.add(det.dkey[i]); if (det.ctype[i] === corp) o.corps.add(det.dkey[i]); o.total += det.cents[i] / 100; }
  const clusters = [...addr.values()].filter(o => o.donors.size >= 3 && o.total >= 10000).sort((a, b) => b.total - a.total).slice(0, 40);
  let refunds = 0, refundN = 0, amended = 0; for (const i of SEL) { if (det.ttype[i] === ttRet) { refunds += det.cents[i] / 100; refundN++; } if (det.amended[i]) amended++; }
  const gross = ds.reduce((s, d) => s + d.total - d.ret, 0);
  const tile = (l, v, d) => `<div class="tile"><div class="l">${l}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
  const th = (k, l, num) => `<th class="${num ? 'num' : ''} ${hrSort.k === k ? 'on' : ''}" data-k="${k}">${l}${hrSort.k === k ? (hrSort.dir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
  const seg = v => `<button class="seg ${intelView === v ? 'on' : ''}" data-v="${v}">${{ headroom: 'Headroom to the limit', cross: 'Cross-candidate donors', cohorts: 'Donor cohorts', compliance: 'Review flags' }[v]}</button>`;
  main.innerHTML = `
  <div class="kpis">${tile('Headroom among proven donors', fmtK(totalHeadroom), `${fmtN(hr.length)} donors who have given $${fmtN(hrMin)}+ could legally give this much more`)}${tile('Maxed for primary or general', fmtN(maxedAny), `${fmtN(genRoom.length)} maxed in the primary but still have general room`)}${tile('Lapsed donors', fmtN(lapsed.length), 'gave $100+ but nothing in the last 180 days')}${tile('Upgrade candidates', fmtN(upgrade.length), '3+ gifts, under $1,000 total, active in last 180 days')}${tile('Over-limit review items', fmtN(over.length), 'donors exceeding a per-election cap after combining addresses')}</div>
  <div class="segs">${seg('headroom')}${seg('cross')}${seg('cohorts')}${seg('compliance')}</div>
  <div id="intelBody"></div>`;
  const body = $('#intelBody');
  const draw = () => {
    if (intelView === 'headroom') {
      body.innerHTML = `<div class="card"><h3>Headroom to the limit</h3><div class="note">How much more each donor can legally give: $8,400 for the primary and the general, $4,800 for each runoff, less what they have already given to this committee (itemized gifts only; party committees excluded). Show donors who have given at least $<input class="inline-in" type="number" id="hrmin" value="${hrMin}"> &nbsp; <button class="btn" id="hrcsv">Copy call sheet CSV</button></div>
      <div class="tw"><table><thead><tr>${th('name', 'Donor')}<th>City</th><th>Employer / occupation</th>${th('total', 'Given', 1)}${th('pri', 'Primary', 1)}${th('pr', 'P. runoff', 1)}${th('gen', 'General', 1)}${th('gr', 'G. runoff', 1)}${th('headroom', 'Headroom', 1)}${th('last', 'Last gift', 1)}</tr></thead><tbody>
      ${hr.slice(0, 500).map(d => { const cell = (v, lim) => `<td class="num" ${v >= lim ? 'style="color:var(--crit)"' : ''}>${fmt$(v)}<div class="small muted">${v >= lim ? 'maxed' : fmt$(lim - v) + ' left'}</div></td>`; return `<tr class="row click" data-k="${d.k}"><td><b>${esc(DICT.name[d.name])}</b></td><td>${esc(DICT.city[d.city])}${DICT.state[d.state] ? ', ' + DICT.state[d.state] : ''}</td><td class="small">${esc(DICT.emp[d.emp])}${DICT.occ[d.occ] ? `<div class="muted">${esc(DICT.occ[d.occ])}</div>` : ''}</td><td class="num"><b>${fmt$(d.total)}</b></td>${cell(d.pri, LIMITS.Primary)}${cell(d.pr, LIMITS['Primary Runoff'])}${cell(d.gen, LIMITS.General)}${cell(d.gr, LIMITS['General Runoff'])}<td class="num"><b>${fmt$(d.headroom)}</b></td><td class="num">${dayStr(d.last)}</td></tr>`; }).join('')}
      </tbody></table></div><div class="small muted" style="margin-top:8px">Showing ${fmtN(Math.min(500, hr.length))} of ${fmtN(hr.length)} donors. Limits are per donor per election for the 2025–26 cycle; a runoff only matters if the candidate is in one.</div></div>`;
      $('#hrmin').addEventListener('change', () => { hrMin = +$('#hrmin').value || 0; draw(); });
      body.querySelectorAll('th[data-k]').forEach(h => h.addEventListener('click', () => { const k = h.dataset.k; if (hrSort.k === k) hrSort.dir *= -1; else { hrSort.k = k; hrSort.dir = k === 'name' ? 1 : -1; } draw(); }));
      body.querySelectorAll('tr.click').forEach(r => r.addEventListener('click', () => openDonor(r.dataset.k, ds)));
      $('#hrcsv').addEventListener('click', async () => { const q = s => { s = String(s ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }; const out = [['Donor', 'City', 'State', 'ZIP', 'Employer', 'Occupation', 'Given', 'Primary', 'Primary runoff', 'General', 'General runoff', 'Headroom', 'Gifts', 'Last gift'].join(',')]; for (const d of hr) out.push([DICT.name[d.name], DICT.city[d.city], DICT.state[d.state], DICT.zip[d.zip], DICT.emp[d.emp], DICT.occ[d.occ], d.total.toFixed(2), d.pri.toFixed(2), d.pr.toFixed(2), d.gen.toFixed(2), d.gr.toFixed(2), d.headroom.toFixed(2), d.n, dayStr(d.last)].map(q).join(',')); try { await navigator.clipboard.writeText(out.join('\n')); toast(`Copied ${fmtN(out.length - 1)} donors`); } catch (e) { toast('Clipboard blocked by the browser'); } });
    } else if (intelView === 'cross') {
      body.innerHTML = `<div class="card"><h3>Cross-candidate donors</h3><div class="note">Loading…</div></div>`;
      ensureCross().then(C => {
        const cid = String(CUR.id); const byId = Object.fromEntries(FIELD.candidates.map(c => [String(c.id), c]));
        let list = C.donors.filter(d => crossAll || d.gifts[cid] != null);
        const others = new Map(); for (const d of list) for (const id of Object.keys(d.gifts)) if (id !== cid) { const o = others.get(id) || { id, n: 0, total: 0 }; o.n++; o.total += d.gifts[id]; others.set(id, o); }
        const oth = [...others.values()].sort((a, b) => b.n - a.n);
        const partyOf = id => byId[id]?.party || '';
        const hedgers = list.filter(d => { const ps = new Set(Object.keys(d.gifts).map(partyOf)); return ps.has('DEM') && ps.has('REP'); }).length;
        body.innerHTML = `<div class="card"><h3>Cross-candidate donors</h3><div class="note">${crossAll ? 'Every donor in the field who gave to two or more committees' : `Donors to ${esc(CUR.committee)} who also gave to another committee in the governor's race`}: ${fmtN(list.length)} donors, ${fmtN(hedgers)} of them giving across party lines. Matching is by name and ZIP, so a donor who used two addresses appears twice. <label style="margin-left:8px"><input type="checkbox" id="crossAll" ${crossAll ? 'checked' : ''}> Show the whole field</label></div>
        ${oth.length ? `<div class="hbars" style="max-width:560px;margin-bottom:14px">${oth.map(o => `<div class="r"><div class="lab">${esc(byId[o.id]?.short || o.id)} <span class="pill" style="border-color:${PARTY_COLOR[partyOf(o.id)] || 'var(--rule)'};color:${PARTY_COLOR[partyOf(o.id)] || 'var(--ink2)'}">${partyOf(o.id)}</span></div><div class="trk"><i style="width:${100 * o.n / oth[0].n}%"></i></div><div class="val">${fmtN(o.n)} shared<span class="muted small"> &nbsp;${fmt$(o.total)}</span></div></div>`).join('')}</div>` : ''}
        <div class="tw"><table><thead><tr><th>Donor</th><th>City</th><th>Employer</th>${crossAll ? '' : `<th class="num">To ${esc(CUR.short)}</th>`}<th>Also gave to</th><th class="num">Field total</th></tr></thead><tbody>
        ${list.slice(0, 400).map(d => `<tr class="row"><td><b>${esc(d.name)}</b>${d.ctype && d.ctype !== 'Individual' ? `<span class="pill">${esc(d.ctype.split(' /')[0])}</span>` : ''}</td><td>${esc(d.city)}${d.state ? ', ' + d.state : ''}</td><td class="small">${esc(d.emp)}</td>${crossAll ? '' : `<td class="num">${fmt$(d.gifts[cid] || 0)}</td>`}<td class="small">${Object.entries(d.gifts).filter(([id]) => crossAll || id !== cid).sort((a, b) => b[1] - a[1]).map(([id, v]) => `<span class="pill" style="margin:1px 4px 1px 0;border-color:${PARTY_COLOR[partyOf(id)] || 'var(--rule)'}">${esc(byId[id]?.short || id)} ${fmt$(v)}</span>`).join('')}</td><td class="num"><b>${fmt$(d.total)}</b></td></tr>`).join('')}
        </tbody></table></div><div class="small muted" style="margin-top:8px">Showing ${fmtN(Math.min(400, list.length))} of ${fmtN(list.length)}.</div></div>`;
        $('#crossAll').addEventListener('change', () => { crossAll = $('#crossAll').checked; draw(); });
      });
    } else if (intelView === 'cohorts') {
      body.innerHTML = `<div class="grid two"><div class="card"><h3>New vs. returning donors by month</h3><div class="note">Distinct named donors giving in each month, split by whether it was their first gift to this committee.</div><div class="legend"><span><i style="background:var(--s3)"></i>First-time</span><span><i style="background:var(--s1)"></i>Returning</span></div><div id="co1"></div></div>
      <div class="card"><h3>Retention snapshot</h3><div class="note">Of ${fmtN(ds.filter(d => d.n > 0).length)} named donors in the current selection.</div>
      <table><tbody><tr><td>Gave once</td><td class="num">${fmtN(ds.filter(d => d.n === 1).length)}</td></tr><tr><td>Gave 2–4 times</td><td class="num">${fmtN(ds.filter(d => d.n >= 2 && d.n <= 4).length)}</td></tr><tr><td>Gave 5+ times</td><td class="num">${fmtN(ds.filter(d => d.n >= 5).length)}</td></tr><tr><td>Active in last 90 days</td><td class="num">${fmtN(ds.filter(d => d.n > 0 && d.last >= end - 90).length)}</td></tr><tr><td>Lapsed (180+ days, gave $100+)</td><td class="num">${fmtN(lapsed.length)}</td></tr></tbody></table></div></div>
      <div class="grid two" style="margin-top:14px">
        <div class="card"><h3>Lapsed donors worth a call</h3><div class="note">Gave $100 or more, nothing in the last 180 days. Sorted by lifetime total.</div><div class="tw" style="max-height:420px"><table><thead><tr><th>Donor</th><th>City</th><th class="num">Lifetime</th><th class="num">Gifts</th><th class="num">Last gift</th></tr></thead><tbody>${lapsed.slice(0, 200).map(d => `<tr class="row click" data-k="${d.k}"><td><b>${esc(DICT.name[d.name])}</b></td><td>${esc(DICT.city[d.city])}</td><td class="num">${fmt$(d.total)}</td><td class="num">${d.n}</td><td class="num">${dayStr(d.last)}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="card"><h3>Upgrade candidates</h3><div class="note">Three or more gifts, under $1,000 in total, active in the last 180 days — loyal donors who could be asked for more.</div><div class="tw" style="max-height:420px"><table><thead><tr><th>Donor</th><th>City</th><th class="num">Gifts</th><th class="num">Total</th><th class="num">Largest</th></tr></thead><tbody>${upgrade.slice(0, 200).map(d => `<tr class="row click" data-k="${d.k}"><td><b>${esc(DICT.name[d.name])}</b></td><td>${esc(DICT.city[d.city])}</td><td class="num">${d.n}</td><td class="num">${fmt$(d.total)}</td><td class="num">${fmt$(d.max)}</td></tr>`).join('')}</tbody></table></div></div>
      </div>`;
      if (cats.length) barsChart($('#co1'), [{ name: 'First-time', color: 'var(--s3)', values: NW }, { name: 'Returning', color: 'var(--s1)', values: RT }], cats, { fmt: fmtN, h: 260, markers: electionMarkersMonthly(kmin) });
      body.querySelectorAll('tr.click').forEach(r => r.addEventListener('click', () => openDonor(r.dataset.k, ds)));
    } else {
      body.innerHTML = `<div class="kpis" style="margin-bottom:14px">${tile('Over a per-election cap', fmtN(over.length), 'after combining a donor\'s addresses')}${tile('Shared-address clusters', fmtN(clusters.length), '3+ donors at one address, $10,000+ combined')}${tile('Refund rate', fmtPct(-refunds, gross), `${fmtN(refundN)} itemized refunds, ${fmt$(-refunds)}`)}${tile('Amended rows', fmtN(amended), 'in the current selection')}</div>
      <div class="grid two">
        <div class="card"><h3>Donors over a per-election cap</h3><div class="note">Gifts combined across all addresses for the same name. Excess can be legitimate (re-attributed to a spouse, refunded later, or a committee with a different limit); treat as a review list, not a finding.</div><div class="tw" style="max-height:460px"><table><thead><tr><th>Donor</th><th class="num">Primary</th><th class="num">P. runoff</th><th class="num">General</th><th class="num">G. runoff</th><th class="num">Addresses</th></tr></thead><tbody>${over.slice(0, 200).map(o => { const c = (v, l) => `<td class="num" ${v > l + 0.01 ? 'style="color:var(--crit);font-weight:600"' : ''}>${fmt$(v)}</td>`; return `<tr class="row"><td><b>${esc(DICT.name[o.name])}</b></td>${c(o.pri, LIMITS.Primary)}${c(o.pr, LIMITS['Primary Runoff'])}${c(o.gen, LIMITS.General)}${c(o.gr, LIMITS['General Runoff'])}<td class="num">${o.keys.size}</td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">None in the current selection.</td></tr>'}</tbody></table></div></div>
        <div class="card"><h3>Shared-address clusters</h3><div class="note">Several distinct donors filing from one street address. Often a family or an office; occasionally a pattern worth a look.</div><div class="tw" style="max-height:460px"><table><thead><tr><th>Address</th><th class="num">Donors</th><th class="num">Businesses</th><th class="num">Combined</th></tr></thead><tbody>${clusters.map(o => `<tr class="row click" data-q="${esc(o.addr)}"><td>${esc(o.addr)}<div class="small muted">${esc(o.city)} ${esc(o.zip)}</div></td><td class="num">${o.donors.size}</td><td class="num">${o.corps.size}</td><td class="num">${fmt$(o.total)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">None in the current selection.</td></tr>'}</tbody></table></div></div>
      </div>`;
      body.querySelectorAll('tr.click[data-q]').forEach(r => r.addEventListener('click', () => { $('#q').value = r.dataset.q; state.q = r.dataset.q.toLowerCase(); apply(); }));
    }
  };
  main.querySelectorAll('.seg').forEach(b => b.addEventListener('click', () => { intelView = b.dataset.v; main.querySelectorAll('.seg').forEach(x => x.classList.toggle('on', x === b)); draw(); }));
  draw();
}

// ---------- geography with county map + metros ----------
async function ensureGeo() { if (GEO) return GEO; const r = await fetch('geo/ga-counties.json'); GEO = await r.json(); return GEO; }
function renderGeo(main) {
  BASE.renderGeo(main);
  const det = D.det;
  const byCounty = groupBy(i => det.county[i], k => DICT.county[k] || '(outside Georgia / unknown)');
  const byMetro = groupBy(i => det.metro[i], k => DICT.metro[k] || '(outside listed metros)');
  const card = document.createElement('div'); card.className = 'grid two'; card.style.marginTop = '14px';
  card.innerHTML = `<div class="card"><h3>Georgia counties</h3><div class="note">Itemized dollars by donor county (ZIP-based). Hover a county; click to search it.</div><div id="map" style="min-height:360px"></div></div>
  <div class="card"><h3>Metro areas</h3><div class="note">Donor ZIPs within a metro radius, in and out of state. Click to search.</div>${hbars(byMetro.filter(r => DICT.metro[r.k]).slice(0, 20), { click: 1 })}</div>`;
  main.insertBefore(card, main.children[1]);
  card.querySelectorAll('.r[data-k]').forEach(r => r.addEventListener('click', () => { const m = DICT.metro[+r.dataset.k]; $('#q').value = m; state.q = m.toLowerCase(); apply(); }));
  ensureGeo().then(geo => {
    const el = $('#map'); if (!el) return; const W = el.clientWidth || 600, H = 420;
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    const each = (g, f) => { const walk = c => { if (typeof c[0] === 'number') f(c); else c.forEach(walk); }; walk(g.coordinates); };
    geo.features.forEach(ft => each(ft.geometry, ([x, y]) => { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }));
    const cosLat = Math.cos((miny + maxy) / 2 * Math.PI / 180);
    const sw = (maxx - minx) * cosLat, sh = (maxy - miny); const sc = Math.min((W - 20) / sw, (H - 20) / sh);
    const px = ([x, y]) => [10 + (x - minx) * cosLat * sc, 10 + (maxy - y) * sc];
    const vals = new Map(byCounty.map(r => [DICT.county[r.k], r])); const max = Math.max(1, ...byCounty.filter(r => DICT.county[r.k]).map(r => r.total));
    const ramp = ['#DCE7F7', '#B7CFF0', '#86B0E6', '#4F8ADB', '#2A6FD6', '#1B4A91'];
    const color = v => { if (!v) return '#F2F4F7'; const t = Math.log10(1 + v) / Math.log10(1 + max); return ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))]; };
    const path = g => { const ring = r => 'M' + r.map(px).map(p => p.map(n => n.toFixed(1)).join(',')).join('L') + 'Z'; return g.type === 'Polygon' ? g.coordinates.map(ring).join('') : g.coordinates.map(poly => poly.map(ring).join('')).join(''); };
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${geo.features.map(ft => { const r = vals.get(ft.properties.name); return `<path d="${path(ft.geometry)}" fill="${color(r ? r.total : 0)}" stroke="#fff" stroke-width=".8" data-n="${esc(ft.properties.name)}" style="cursor:pointer"/>`; }).join('')}</svg>
    <div class="legend" style="margin-top:6px"><span class="muted small">Less</span>${ramp.map(c => `<span><i style="background:${c};margin:0"></i></span>`).join('')}<span class="muted small">More (log scale)</span></div>`;
    el.querySelectorAll('path').forEach(p => { p.addEventListener('mouseenter', () => { const r = vals.get(p.dataset.n); showTT(`<b>${esc(p.dataset.n)} County</b><br>${r ? `${fmt$(r.total)} from ${fmtN(r.donors)} donors, ${fmtN(r.n)} gifts` : 'No itemized gifts'}`); p.setAttribute('stroke', 'var(--gold)'); p.setAttribute('stroke-width', '1.6'); }); p.addEventListener('mouseleave', () => { hideTT(); p.setAttribute('stroke', '#fff'); p.setAttribute('stroke-width', '.8'); }); p.addEventListener('click', () => { $('#q').value = p.dataset.n; state.q = p.dataset.n.toLowerCase(); apply(); }); });
  });
}

// ---------- employers: sectors ----------
function renderWork(main) {
  BASE.renderWork(main);
  const det = D.det; const bySector = groupBy(i => det.sector[i], k => DICT.sector[k] || '(unknown)');
  const tot = bySector.reduce((s, r) => s + r.total, 0);
  const card = document.createElement('div'); card.className = 'card'; card.style.marginBottom = '14px';
  card.innerHTML = `<h3>Industry sectors</h3><div class="note">Itemized dollars by sector, classified from the donor's self-reported occupation and employer with keyword rules. "Retired / not employed" includes the "Not Employed" default many online platforms record. Click a sector to search.</div>
  <div class="grid two"><div>${hbars(bySector.slice(0, 20), { click: 1 })}</div><div><table><thead><tr><th>Sector</th><th class="num">Donors</th><th class="num">Avg gift</th><th class="num">Share of $</th></tr></thead><tbody>${bySector.slice(0, 20).map(r => `<tr><td>${esc(r.label)}</td><td class="num">${fmtN(r.donors)}</td><td class="num">${fmt$2(r.total / r.n)}</td><td class="num">${pct(r.total, tot)}</td></tr>`).join('')}</tbody></table></div></div>`;
  main.insertBefore(card, main.children[1]);
  card.querySelectorAll('.r[data-k]').forEach(r => r.addEventListener('click', () => { const s = DICT.sector[+r.dataset.k]; if (!s) return; $('#q').value = s; state.q = s.toLowerCase(); apply(); }));
}

// ---------- field: spending columns + raised vs spent ----------
function renderField(main) {
  BASE.renderField(main);
  const C = FIELD.candidates;
  const burnOf = c => { const ks = Object.keys(c.monthlySpend || {}).map(Number).sort((a, b) => a - b); const full = ks.slice(0, -1).slice(-3); return full.length ? full.reduce((s, k) => s + c.monthlySpend[k], 0) / full.length : (ks.length ? c.monthlySpend[ks[ks.length - 1]] : 0); };
  const rows = [...C].filter(c => c.net > 0 || c.spent > 0).sort((a, b) => (b.cashOnHand || 0) - (a.cashOnHand || 0));
  const card = document.createElement('div'); card.className = 'card'; card.style.marginTop = '14px';
  card.innerHTML = `<h3>Money in, money out</h3><div class="note">Spending from the Commission's expenditure files; cash on hand from its candidate registry. Runway = cash on hand ÷ average burn over the last three complete months.</div>
  <div class="tw" style="max-height:none"><table><thead><tr><th>Candidate</th><th class="num">Raised (net)</th><th class="num">Spent</th><th class="num">Spent per $ raised</th><th class="num">Cash on hand</th><th class="num">Recent burn / mo</th><th class="num">Runway</th></tr></thead><tbody>
  ${rows.map(c => { const b = burnOf(c); const rw = c.cashOnHand != null && b > 0 ? c.cashOnHand / b : null; return `<tr class="row click" data-id="${c.id}"><td><b>${esc(c.cand)}</b> <span class="pill" style="border-color:${PARTY_COLOR[c.party] || 'var(--rule)'};color:${PARTY_COLOR[c.party] || 'var(--ink2)'}">${c.party}</span></td><td class="num">${fmt$(c.net)}</td><td class="num">${fmt$(c.spent)}</td><td class="num">${c.net ? '$' + (c.spent / c.net).toFixed(2) : '—'}</td><td class="num"><b>${c.cashOnHand != null ? fmt$(c.cashOnHand) : '—'}</b></td><td class="num">${fmt$(b)}</td><td class="num">${rw != null ? rw.toFixed(1) + ' mo' : '—'}</td></tr>`; }).join('')}
  </tbody></table></div>
  <div class="legend" style="margin-top:14px"><span><i style="background:var(--s1)"></i>Raised (net)</span><span><i style="background:var(--s8)"></i>Spent</span><span><i style="background:var(--s4)"></i>Cash on hand</span></div><div id="f3"></div><div class="small muted">Rick Jackson is left off the chart so the rest of the field is legible; his figures are in the table.</div>`;
  main.insertBefore(card, main.children[2]);
  card.querySelectorAll('tr.click').forEach(r => r.addEventListener('click', () => { tab = 'overview'; [...$('#tabs').children].forEach(x => x.setAttribute('aria-selected', x.dataset.tab === 'overview')); loadCandidate(+r.dataset.id); }));
  const chartRows = rows.filter(c => c.id !== 103524 && c.net > 50000);
  barsChart($('#f3'), [{ name: 'Raised', color: 'var(--s1)', values: chartRows.map(c => c.net) }, { name: 'Spent', color: 'var(--s8)', values: chartRows.map(c => c.spent) }, { name: 'Cash on hand', color: 'var(--s4)', values: chartRows.map(c => c.cashOnHand || 0) }], chartRows.map(c => c.short), { grouped: true, h: 280 });
}

// ---------- routing ----------
function render() {
  const main = $('#main');
  const hideFilters = tab === 'field';
  $('#filters').style.display = hideFilters ? 'none' : ''; $('#chips').style.display = hideFilters ? 'none' : ''; $('#copyCsv').style.visibility = (hideFilters || tab === 'spending') ? 'hidden' : '';
  if (tab === 'field') { renderField(main); return; }
  if (D && CUR) { $('#title').textContent = D.meta.committee; $('#subtitle').textContent = D.meta._sub || ''; }
  if (tab === 'overview') renderOverview(main); else if (tab === 'donors') renderDonors(main); else if (tab === 'intel') renderIntel(main); else if (tab === 'contribs') renderContribs(main); else if (tab === 'spending') renderSpending(main); else if (tab === 'geo') renderGeo(main); else if (tab === 'work') renderWork(main); else renderReports(main);
}
// extend the search blob with county, metro and sector once a candidate loads
function extendSearch() {
  if (!D || D._searchExtended) return; D._searchExtended = true;
  const det = D.det; const co = DICT.county, me = DICT.metro, se = DICT.sector;
  for (let i = 0; i < N; i++) D.search[i] += '|' + (co[det.county[i]] + '|' + me[det.metro[i]] + '|' + se[det.sector[i]]).toLowerCase();
}
async function load(id) {
  await BASE.load(id);
  extendSearch();
  if (state.q) apply();
}
// accept the new tab names in the hash
(function () { const h = (location.hash || '').slice(1); const hm = h.match(/^(?:cand-\d+-)?(intel|spending)$/); if (hm) { tab = hm[1]; [...$('#tabs').children].forEach(x => x.setAttribute('aria-selected', x.dataset.tab === tab)); } })();
// if the base page already finished loading before this script arrived (cached data), re-render with the extended views
if (typeof D !== 'undefined' && D && D.det) { extendSearch(); render(); }
