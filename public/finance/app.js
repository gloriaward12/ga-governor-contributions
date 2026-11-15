// Finance area: ask lists built from the public filings (campaign + leadership committee), ready to be enriched with ActBlue and capacity data.
const $ = s => document.querySelector(s);
const fmt$ = v => (v < 0 ? '-' : '') + '$' + Math.round(Math.abs(v)).toLocaleString();
const fmtN = v => Math.round(v).toLocaleString();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EPOCH = Date.UTC(2025, 0, 1);
const dayStr = d => { const t = new Date(EPOCH + d * 86400000); return `${String(t.getUTCMonth() + 1).padStart(2, '0')}/${String(t.getUTCDate()).padStart(2, '0')}/${t.getUTCFullYear()}`; };
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(() => t.style.display = 'none', 2200); };
const LIMIT = 8400;
const CAMP = 100663, LEAD = 105433;
const PUBLIC_RX = /\b(state of georgia|georgia (dept|department|state|tech|institute|southern|gwinnett|perimeter|college)|university|college|board of education|public schools?|city schools?|county schools?|school district|county|city of|fulton|dekalb|cobb|gwinnett|clayton|marta|atlanta public|us government|u\.?s\.? (army|navy|air force|dept|department|postal)|federal|dept\.? of|department of|public health|cdc|va medical|veterans affairs|municipal|sheriff|police|fire (dept|department|rescue)|court|district attorney|public defender|legislature|general assembly)\b/i;

let FIELD, SALARY_META = null, DONORS = [], ASOF = 0, seg = 'headroom', sortK = 'score', sortDir = -1, page = 0, q = '';

async function loadJSON(p) { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); }

function records(P, which) {
  const det = P.det, dict = P.dict, con = dict.ttype.indexOf('Contribution'), ret = dict.ttype.indexOf('Return Contribution');
  const xfer = dict.ctype.indexOf('Candidate / Candidate Committee'), ind = dict.ctype.indexOf('Individual');
  const ePri = dict.etype.indexOf('Primary'), eGen = dict.etype.indexOf('General');
  const out = new Map();
  for (let i = 0; i < det.tid.length; i++) {
    const t = det.ttype[i]; if (t !== con && t !== ret) continue; if (det.ctype[i] === xfer) continue;
    const k = dict.nkey[det.nkey[i]] + '|' + (dict.state[det.state[i]] || '');
    let o = out.get(k);
    if (!o) { o = { k, name: dict.name[det.name[i]], city: dict.city[det.city[i]], state: dict.state[det.state[i]], zip: dict.zip[det.zip[i]], emp: dict.emp[det.emp[i]], occ: dict.occ[det.occ[i]], individual: det.ctype[i] === ind, total: 0, n: 0, first: 1e9, last: -1, max: 0, pri: 0, gen: 0, days: new Set() }; out.set(k, o); }
    const a = det.cents[i] / 100; o.total += a;
    if (t === con) { o.n++; o.days.add(det.day[i]); if (det.day[i] < o.first) o.first = det.day[i]; if (det.day[i] > o.last) o.last = det.day[i]; if (a > o.max) o.max = a; if (which === CAMP) { if (det.etype[i] === ePri) o.pri += a; else if (det.etype[i] === eGen) o.gen += a; } }
    if (!o.emp && dict.emp[det.emp[i]]) { o.emp = dict.emp[det.emp[i]]; o.occ = dict.occ[det.occ[i]]; }
  }
  return out;
}

function band(v) { const B = [100, 250, 500, 1000, 2500, 5000, LIMIT]; for (const b of B) if (v <= b) return b; return LIMIT; }

function build(camp, lead) {
  const all = new Map();
  const merge = (m, which) => { for (const [k, o] of m) { let r = all.get(k); if (!r) { r = { k, name: o.name, city: o.city, state: o.state, zip: o.zip, emp: o.emp, occ: o.occ, individual: o.individual, camp: 0, lead: 0, total: 0, n: 0, first: 1e9, last: -1, max: 0, pri: 0, gen: 0, distinct: new Set() }; all.set(k, r); } if (which === CAMP) r.camp += o.total; else r.lead += o.total; r.total += o.total; r.n += o.n; if (o.first < r.first) r.first = o.first; if (o.last > r.last) r.last = o.last; if (o.max > r.max) r.max = o.max; r.pri += o.pri; r.gen += o.gen; o.days.forEach(d => r.distinct.add(d)); if (!r.emp && o.emp) { r.emp = o.emp; r.occ = o.occ; } } };
  merge(camp, CAMP); merge(lead, LEAD);
  const rows = [...all.values()].filter(r => r.n > 0 && r.total > 0);
  ASOF = Math.max(...rows.map(r => r.last));
  for (const r of rows) {
    r.recency = ASOF - r.last; r.tenure = ASOF - r.first; r.avg = r.total / r.n; r.gifts = r.n; r.touches = r.distinct.size; delete r.distinct;
    r.maxed = r.individual && (r.pri >= LIMIT || r.gen >= LIMIT);   // limits apply per person; organizations are listed separately
    r.headroom = r.individual ? Math.max(0, LIMIT - r.pri) + Math.max(0, LIMIT - r.gen) : 0;   // campaign only; Battleground has no limit
    r.over = r.individual && (r.pri > LIMIT || r.gen > LIMIT);
    r.public = PUBLIC_RX.test(r.emp || '') || PUBLIC_RX.test(r.occ || '');
    // suggested next ask: a step above what they have shown they will give, rounded to a band; maxed donors are a leadership-committee or next-cycle ask
    const base = Math.max(r.max * 1.5, r.avg * 2, 100);
    r.ask = r.maxed ? LIMIT : band(base);
    r.askNote = r.maxed ? 'maxed this cycle: leadership committee or next cycle' : r.ask > r.max ? `step up from ${fmt$(r.max)} largest gift` : 'hold at largest gift';
    // priority score: money, recency, frequency (each 1 to 5)
    r.score = 0;
  }
  const q5 = (arr, key, inv) => { const s = [...arr].sort((a, b) => a[key] - b[key]); const n = s.length; s.forEach((r, i) => { let v = Math.min(5, Math.floor(i / n * 5) + 1); r['q_' + key] = inv ? 6 - v : v; }); };
  q5(rows, 'total'); q5(rows, 'gifts'); q5(rows, 'recency', true);
  for (const r of rows) r.score = r.q_total * 2 + r.q_recency + r.q_gifts;
  return rows;
}

const SEGS = {
  headroom: { label: 'Headroom ≥ $4,000', test: r => r.total >= 1000 && r.headroom >= 4000 && !r.maxed, note: 'Proven donors ($1,000+ given) who can still legally give at least $4,000 more to the campaign this cycle. The money that is already in the room.' },
  maxed: { label: 'Maxed this cycle', test: r => r.maxed, note: 'Gave the $8,400 limit for the primary or the general to the campaign. The recognition list, and the first ask for the leadership committee or the next cycle.' },
  lapsed: { label: 'Lapsed, $1,000 and up', test: r => r.total >= 1000 && r.recency > 180, note: 'Gave at least $1,000 in total but nothing in the last six months. A personal re-engagement, not a blast.' },
  upgrade: { label: 'Upgrade candidates', test: r => r.gifts >= 3 && r.max <= 250 && r.total < 2500 && !r.maxed, note: 'Three or more gifts, none above $250. Frequency without size: the clearest sign a larger ask will land.' },
  onetime: { label: 'One large gift, then silence', test: r => r.gifts === 1 && r.max >= 1000 && r.recency > 90, note: 'A single gift of $1,000 or more and nothing since. Thank first, then ask.' },
  leadonly: { label: 'Battleground only', test: r => r.lead >= 1000 && r.camp === 0, note: 'Gave $1,000 or more to Project Battleground Georgia and never to the campaign. Already comfortable with large, unlimited gifts.' },
  camponly: { label: 'Campaign only, $2,500 and up', test: r => r.camp >= 2500 && r.lead === 0, note: 'Significant campaign donors who were never asked for the leadership committee.' },
  recent: { label: 'New in the last 60 days', test: r => r.tenure <= 60, note: 'First gift in the final stretch. Steward now; they are the next cycle’s base.' },
  over: { label: 'Over-limit flags', test: r => r.over, note: 'Itemized campaign giving above the $8,400 limit for an election as filed. Usually a refund already made or a mis-coded election; each one needs a look by compliance.' },
  publicemp: { label: 'Public or university employer', test: r => r.public, note: 'Employer or occupation suggests a government or university salary. Capacity can be matched to public pay records.' },
  capacity: { label: 'Salary known', test: r => r.salary > 0, note: 'Donors matched to a published Georgia public salary (Open Georgia, fiscal 2025).' },
  watched: { label: 'Watched', test: r => WATCH.has(r.k), note: 'Donors someone on the team is keeping an eye on. Appear in the digest when they give again.' },
  mine: { label: 'My actions', test: r => OPEN.has(r.k) && (OPEN.get(r.k).owner === gpUser()), note: 'Donors with an open action assigned to you. The full list, with status changes, is on the Actions page.' },
  all: { label: 'All donors', test: () => true, note: 'Every itemized donor across both committees, scored by amount, recency and frequency.' }
};
let WATCH = new Set(), OPEN = new Map(), SEL = new Set(), showSheet = false;
function refreshIdx() { WATCH = new Set(watched().map(w => w.key)); OPEN = new Map(); for (const a of actions()) if (!['closed', 'skipped'].includes(a.status)) OPEN.set(a.key, a); }
const OWNERS = () => [...new Set([...gpRec('users', []), ...actions().map(a => a.owner)].filter(Boolean))];
function digest(rows) {
  const d7 = ASOF - 7; const A = actions();
  const newHigh = rows.filter(r => r.last >= d7 && r.max >= 2500 && r.headroom >= 4000 && !r.maxed);
  const newLapsed = rows.filter(r => r.total >= 1000 && r.recency > 180 && r.recency <= 187);
  const watchedGave = rows.filter(r => WATCH.has(r.k) && r.last >= d7);
  const over = rows.filter(r => r.over);
  const due = A.filter(a => !['closed', 'skipped'].includes(a.status) && a.next && (new Date(a.next) - Date.now()) / 86400000 <= 3);
  return { newHigh, newLapsed, watchedGave, over, due };
}
function render() {
  refreshIdx();
  const main = $('#main'); const rows = DONORS;
  const counts = Object.fromEntries(Object.entries(SEGS).map(([k, s]) => [k, rows.filter(s.test)]));
  const S = SEGS[seg]; let list = counts[seg];
  if (q) { const toks = q.toLowerCase().split(/\s+/).filter(Boolean); list = list.filter(r => { const hay = (r.name + ' ' + r.emp + ' ' + r.occ + ' ' + r.city + ' ' + r.zip).toLowerCase(); return toks.every(t => hay.includes(t)); }); }
  list = [...list].sort((a, b) => { const va = a[sortK], vb = b[sortK]; if (typeof va === 'number') return (va - vb) * sortDir || b.total - a.total; return (String(va) < String(vb) ? -1 : 1) * sortDir; });
  const PS = 50, pages = Math.max(1, Math.ceil(list.length / PS)); page = Math.min(page, pages - 1); const pg = list.slice(page * PS, (page + 1) * PS);
  const sum = arr => arr.reduce((s, r) => s + r.total, 0);
  const th = (k, l, num) => `<th class="${num ? 'num' : ''} ${sortK === k ? 'on' : ''}" data-k="${k}">${l}${sortK === k ? (sortDir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
  const tile = (l, v, d) => `<div class="tile"><div class="l">${l}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
  const DG = digest(rows); const A = actions(); const openA = A.filter(a => !['closed', 'skipped'].includes(a.status));
  const stPill = s => `<span class="pill ${s === 'pledged' ? 'ok' : s === 'contacted' ? 'gold' : s === 'open' ? 'hot' : ''}">${s}</span>`;
  const views = segments();
  main.innerHTML = `
  <h1>Ask lists</h1><p class="sub">Itemized donors to Keisha for Governor and Project Battleground Georgia, combined, as filed through ${dayStr(ASOF)}. Not public: built from public filings but organized for fundraising. No phone or email lives here; contact details stay in NGP.</p>
  <div class="bar" style="margin:0 0 10px;align-items:center"><span id="who"></span><span style="flex:1"></span><a class="btn" href="/finance/actions">Actions <b>${openA.length}</b></a><a class="btn" href="/finance/compare">Compare the field</a></div>
  <div class="kpis">${tile('Headroom ≥ $4k', fmtN(counts.headroom.length), `${fmt$(counts.headroom.reduce((s, r) => s + r.headroom, 0))} they could still give`)}${tile('Maxed this cycle', fmtN(counts.maxed.length), fmt$(sum(counts.maxed)))}${tile('Lapsed $1,000+', fmtN(counts.lapsed.length), fmt$(sum(counts.lapsed)))}${tile('Upgrade candidates', fmtN(counts.upgrade.length), fmt$(sum(counts.upgrade)))}${tile('Over-limit flags', fmtN(counts.over.length), 'need a compliance look')}${tile('Open actions', fmtN(openA.length), `${A.filter(a => a.status === 'pledged').length} pledged · ${fmt$(openA.reduce((s, a) => s + (a.ask || 0), 0))} asked`)}</div>
  <div class="card" style="margin:12px 0"><h3>This week’s digest</h3><div class="note">What changed since the last filing week. <button class="btn" id="copydig" style="margin-left:8px">Copy digest</button></div>
    <div class="dg"><div><b>${DG.newHigh.length}</b> new high-headroom gifts<div class="small muted">$2,500+ in the last 7 days with $4k+ room left: ${DG.newHigh.slice(0, 4).map(r => esc(r.name)).join(', ') || 'none'}</div></div>
    <div><b>${DG.newLapsed.length}</b> newly lapsed $1k+<div class="small muted">crossed six months this week: ${DG.newLapsed.slice(0, 4).map(r => esc(r.name)).join(', ') || 'none'}</div></div>
    <div><b>${DG.watchedGave.length}</b> watched donors gave<div class="small muted">${DG.watchedGave.slice(0, 4).map(r => esc(r.name)).join(', ') || 'none'}</div></div>
    <div><b>${DG.over.length}</b> over-limit flags<div class="small muted">${DG.over.slice(0, 3).map(r => esc(r.name)).join(', ') || 'none'}</div></div>
    <div><b>${DG.due.length}</b> actions due in 3 days<div class="small muted">${DG.due.slice(0, 4).map(a => esc(a.name) + (a.owner ? ' (' + esc(a.owner) + ')' : '')).join(', ') || 'none'}</div></div></div></div>
  <div class="segs">${Object.entries(SEGS).map(([k, s]) => `<button class="seg ${seg === k ? 'on' : ''}" data-seg="${k}">${s.label} <b>${fmtN(counts[k].length)}</b></button>`).join('')}</div>
  <div class="card"><h3>${S.label}</h3><div class="note">${S.note} <b>Suggested ask</b> is a step above the donor’s demonstrated giving, rounded to a standard band, capped at the $8,400 limit; <b>score</b> weighs amount (double), recency and frequency on a 1–5 scale.</div>
    <div class="bar"><input type="search" id="q" placeholder="Search name, employer, occupation, city or ZIP" value="${esc(q)}"><button class="btn" id="csv">Copy this list as CSV</button><button class="btn" id="saveview">Save this view</button>${views.length ? `<select class="btn" id="views"><option value="">Saved views (${views.length})</option>${views.map(v => `<option value="${v.id}">${esc(v.name)}${v.shared ? '' : ' (private)'} · ${esc(v.by || '')}</option>`).join('')}</select>` : ''}<span class="small muted">${fmtN(list.length)} donors, ${fmt$(sum(list))}${SEL.size ? ` · <b>${SEL.size} selected</b>` : ''}</span><span style="flex:1"></span><button class="btn primary" id="sheet" ${SEL.size ? '' : 'disabled'}>Build call sheet (${SEL.size})</button></div>
    ${showSheet ? sheetPanel(rows) : ''}
    <div class="tw"><table><thead><tr><th><input type="checkbox" id="selall" title="select page"></th>${th('score', 'Score', 1)}${th('name', 'Donor')}<th>Location</th><th>Employer / occupation</th>${th('total', 'Given', 1)}${th('headroom', 'Headroom', 1)}${th('last', 'Last gift', 1)}${th('ask', 'Ask', 1)}<th>Status · owner</th><th>Actions</th></tr></thead><tbody>
    ${pg.map(r => { const a = OPEN.get(r.k); return `<tr data-k="${esc(r.k)}"><td><input type="checkbox" class="sel" ${SEL.has(r.k) ? 'checked' : ''}></td><td class="num"><b>${r.score}</b></td><td><b>${esc(r.name)}</b>${r.maxed ? '<span class="pill ok">maxed</span>' : ''}${r.over ? '<span class="pill hot">over limit</span>' : ''}${WATCH.has(r.k) ? '<span class="pill gold">★ watched</span>' : ''}<div class="small muted">${r.camp ? 'Campaign ' + fmt$(r.camp) : ''}${r.lead ? (r.camp ? ' · ' : '') + 'Battleground ' + fmt$(r.lead) : ''} · ${r.gifts} gift${r.gifts === 1 ? '' : 's'}</div></td><td class="small">${esc(r.city)}, ${esc(r.state)}</td><td class="small">${esc(r.emp || '')}${r.occ ? '<div class="muted">' + esc(r.occ) + '</div>' : ''}${r.salary ? `<div class="muted">public salary ${fmt$(r.salary)}</div>` : ''}</td><td class="num">${fmt$(r.total)}</td><td class="num">${r.individual ? fmt$(r.headroom) : '<span class="muted">org</span>'}</td><td class="num small">${dayStr(r.last)}<div class="muted">${r.recency}d ago</div></td><td class="num"><b>${fmt$(r.ask)}</b><div class="small muted">${esc(r.askNote)}</div></td><td class="small">${a ? `${stPill(a.status)}<div>${esc(a.owner || 'unassigned')}${a.next ? ' · due ' + a.next : ''}</div>` : '<span class="muted">—</span>'}</td><td class="small nowrap"><button class="btn xs" data-act="sheet">+ Call sheet</button> <button class="btn xs" data-act="assign">Assign</button> <button class="btn xs" data-act="watch">${WATCH.has(r.k) ? 'Unwatch' : 'Watch'}</button> <button class="btn xs" data-act="note">Note</button></td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="pager"><button class="btn" id="prev" ${page === 0 ? 'disabled' : ''}>Previous</button><span>Page ${page + 1} of ${pages}</span><button class="btn" id="next" ${page >= pages - 1 ? 'disabled' : ''}>Next</button></div></div>`;
  userChip($('#who'));
  const byKey = new Map(rows.map(r => [r.k, r]));
  main.querySelectorAll('[data-seg]').forEach(b => b.addEventListener('click', () => { seg = b.dataset.seg; page = 0; render(); }));
  main.querySelectorAll('th[data-k]').forEach(h => h.addEventListener('click', () => { const k = h.dataset.k; if (sortK === k) sortDir *= -1; else { sortK = k; sortDir = k === 'name' ? 1 : -1; } page = 0; render(); }));
  const qi = $('#q'); let t; qi.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { q = qi.value.trim(); page = 0; const pos = qi.selectionStart; render(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); }, 250); });
  $('#prev').addEventListener('click', () => { page--; render(); }); $('#next').addEventListener('click', () => { page++; render(); });
  $('#selall').addEventListener('change', e => { pg.forEach(r => e.target.checked ? SEL.add(r.k) : SEL.delete(r.k)); render(); });
  main.querySelectorAll('.sel').forEach(c => c.addEventListener('change', () => { const k = c.closest('tr').dataset.k; c.checked ? SEL.add(k) : SEL.delete(k); const y = scrollY; render(); scrollTo(0, y); }));
  main.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => { const r = byKey.get(b.closest('tr').dataset.k); const y = scrollY;
    if (b.dataset.act === 'watch') { const on = watchToggle(r); toast(on ? 'Watching ' + r.name : 'Stopped watching'); }
    if (b.dataset.act === 'sheet') { SEL.add(r.k); showSheet = true; }
    if (b.dataset.act === 'assign') { const o = prompt('Assign to (name)', gpUser() || ''); if (o === null) return; const a = OPEN.get(r.k); if (a) actionUpdate(a.id, { owner: o }); else actionCreate(r, { owner: o, segment: SEGS[seg].label }); toast('Assigned to ' + o); }
    if (b.dataset.act === 'note') { const a = OPEN.get(r.k) || actionCreate(r, { segment: SEGS[seg].label, owner: gpUser() }); const n = prompt('Note', a.notes || ''); if (n === null) return; actionUpdate(a.id, { notes: n }, 'note'); }
    render(); scrollTo(0, y); }));
  $('#sheet').addEventListener('click', () => { showSheet = !showSheet; render(); });
  $('#saveview').addEventListener('click', () => { const name = prompt('Name this view', SEGS[seg].label + (q ? ' · ' + q : '')); if (!name) return; const shared = confirm('Share with the team? (Cancel = private to you)'); segmentSave({ name, shared, filter: { seg, q, sortK, sortDir } }); toast('View saved'); render(); });
  const vs = $('#views'); if (vs) vs.addEventListener('change', e => { const v = segments().find(x => x.id === e.target.value); if (!v) return; if (e.shiftKey) return; seg = v.filter.seg; q = v.filter.q || ''; sortK = v.filter.sortK; sortDir = v.filter.sortDir; page = 0; render(); });
  $('#copydig').addEventListener('click', () => { const L = [`Governor Pulse digest · filings through ${dayStr(ASOF)}`, `New high-headroom gifts (7d): ${DG.newHigh.map(r => `${r.name} ${fmt$(r.max)} (room ${fmt$(r.headroom)})`).join('; ') || 'none'}`, `Newly lapsed $1k+: ${DG.newLapsed.map(r => r.name).join('; ') || 'none'}`, `Watched donors who gave: ${DG.watchedGave.map(r => r.name).join('; ') || 'none'}`, `Over-limit flags: ${DG.over.map(r => r.name).join('; ') || 'none'}`, `Actions due in 3 days: ${DG.due.map(a => `${a.name} (${a.owner || 'unassigned'}, ${a.next})`).join('; ') || 'none'}`]; navigator.clipboard.writeText(L.join('\n')).then(() => toast('Digest copied')); });
  $('#csv').addEventListener('click', async () => { const out = [['Segment', 'Score', 'Donor', 'City', 'State', 'ZIP', 'Employer', 'Occupation', 'Campaign', 'Battleground', 'Total', 'Gifts', 'Largest', 'Last gift', 'Headroom', 'Suggested ask', 'Status', 'Owner'], ...list.map(r => { const a = OPEN.get(r.k); return [SEGS[seg].label, r.score, r.name, r.city, r.state, r.zip, r.emp, r.occ, r.camp, r.lead, r.total, r.gifts, r.max, dayStr(r.last), r.headroom, r.ask, a ? a.status : '', a ? a.owner : '']; })]; await navigator.clipboard.writeText(out.map(r => r.map(csvQ).join(',')).join('\n')); toast(`${list.length} rows copied as CSV`); });
  if (showSheet) wireSheet(rows);
}
function sheetPanel(rows) {
  const sel = rows.filter(r => SEL.has(r.k)); const owners = OWNERS();
  return `<div class="panel" style="padding:12px 14px;margin:8px 0"><h3 style="margin:0 0 6px">Call sheet · ${sel.length} donor${sel.length === 1 ? '' : 's'} · ${fmt$(sel.reduce((s, r) => s + r.ask, 0))} in suggested asks</h3>
    <div class="bar" style="flex-wrap:wrap;gap:8px"><label class="small">Owner <input id="sh-owner" list="owners" value="${esc(gpUser())}" placeholder="name"><datalist id="owners">${owners.map(o => `<option>${esc(o)}</option>`).join('')}</datalist></label><label class="small">Due <input type="date" id="sh-due" value="${new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}"></label><label class="small">Ask override <input id="sh-ask" type="number" placeholder="leave blank to keep each donor’s ask" style="width:220px"></label><label class="small">Segment label <input id="sh-seg" value="${esc(SEGS[seg].label)}"></label>
      <button class="btn primary" id="sh-create">Create ${sel.length} action${sel.length === 1 ? '' : 's'}</button><button class="btn" id="sh-csv">Download CSV</button><button class="btn" id="sh-print">Printable one-pager</button><button class="btn" id="sh-clear">Clear selection</button></div>
    <div class="small muted" style="margin-top:6px">The CSV and the one-pager carry name, city, employer, giving, last gift, headroom and suggested ask, with blank Phone / Email / Notes columns to fill from NGP. Contact details are never stored here.</div></div>`;
}
function wireSheet(rows) {
  const sel = rows.filter(r => SEL.has(r.k)); const askOf = r => { const o = +$('#sh-ask').value; return o > 0 ? o : r.ask; };
  const rowsOut = () => sel.map(r => ({ name: r.name, city: r.city, state: r.state, emp: r.emp, occ: r.occ, given: r.total, last: dayStr(r.last), headroom: r.headroom, ask: askOf(r), largest: r.max, gifts: r.gifts }));
  $('#sh-create').addEventListener('click', () => { const owner = $('#sh-owner').value.trim(), due = $('#sh-due').value, segl = $('#sh-seg').value; let n = 0; sel.forEach(r => { if (OPEN.get(r.k)) { actionUpdate(OPEN.get(r.k).id, { owner, next: due }); } else { actionCreate(r, { owner, next: due, ask: askOf(r), segment: segl }); } n++; }); SEL.clear(); showSheet = false; toast(`${n} actions ${owner ? 'assigned to ' + owner : 'created'}`); render(); });
  $('#sh-csv').addEventListener('click', () => { const out = [['Donor', 'City', 'State', 'Employer', 'Occupation', 'Given', 'Largest gift', 'Gifts', 'Last gift', 'Headroom', 'Suggested ask', 'Owner', 'Due', 'Phone', 'Email', 'Notes'], ...rowsOut().map(r => [r.name, r.city, r.state, r.emp, r.occ, r.given, r.largest, r.gifts, r.last, r.headroom, r.ask, $('#sh-owner').value, $('#sh-due').value, '', '', ''])]; dlText(`call-sheet-${new Date().toISOString().slice(0, 10)}.csv`, out.map(r => r.map(csvQ).join(',')).join('\n')); });
  $('#sh-print').addEventListener('click', () => { const w = window.open('', '_blank'); const R = rowsOut(); w.document.write(`<title>Call sheet</title><style>body{font:12px/1.4 -apple-system,Segoe UI,Arial,sans-serif;margin:28px}h1{font-size:16px;margin:0 0 2px}p{margin:0 0 12px;color:#555}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:6px 6px;text-align:left;vertical-align:top}th{font-size:11px;color:#555;text-transform:uppercase}td.n{text-align:right;white-space:nowrap}.w{width:120px}</style><h1>Call sheet · ${esc($('#sh-seg').value)}</h1><p>${R.length} donors · ${fmt$(R.reduce((s, r) => s + r.ask, 0))} in suggested asks · owner ${esc($('#sh-owner').value || '—')} · due ${esc($('#sh-due').value || '—')} · filings through ${dayStr(ASOF)}. Internal; contact details from NGP.</p><table><thead><tr><th>Donor</th><th>City</th><th>Employer / occupation</th><th>Given</th><th>Last gift</th><th>Headroom</th><th>Ask</th><th class="w">Phone / email</th><th class="w">Outcome</th></tr></thead><tbody>${R.map(r => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.city)}</td><td>${esc(r.emp)}${r.occ ? '<br><span style="color:#777">' + esc(r.occ) + '</span>' : ''}</td><td class="n">${fmt$(r.given)}<br><span style="color:#777">${r.gifts} gifts, max ${fmt$(r.largest)}</span></td><td class="n">${r.last}</td><td class="n">${fmt$(r.headroom)}</td><td class="n"><b>${fmt$(r.ask)}</b></td><td></td><td></td></tr>`).join('')}</tbody></table>`); w.document.close(); w.print(); });
  $('#sh-clear').addEventListener('click', () => { SEL.clear(); showSheet = false; render(); });
}

(async () => {
  try {
    FIELD = await loadJSON('/data/field.json');
    const v = encodeURIComponent(FIELD.generated || '');
    const [camp, lead] = await Promise.all([loadJSON(`/data/cand-${CAMP}.json?v=${v}`), loadJSON(`/data/cand-${LEAD}.json?v=${v}`)]);
    DONORS = build(records(camp, CAMP), records(lead, LEAD));
    try { const S = await loadJSON('/finance/salary.json'); const byKey = new Map(S.matches.map(m => [m.key + '|GA', m])); for (const r of DONORS) { const m = byKey.get(r.k); if (m) { r.salary = m.salary; r.salaryTitle = m.title; r.salaryOrg = m.org; r.salaryConf = m.confidence; r.givingPct = r.total / m.salary; } } SALARY_META = S; } catch (e) { console.warn('salary file not loaded', e); }
    await gpSync(); render();
  } catch (e) { $('#main').innerHTML = `<div class="loading">Could not load donor data: ${esc(e.message)}</div>`; }
})();
