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

let FIELD, SALARY_META = null, DONORS = [], ASOF = 0, seg = 'maxed', sortK = 'score', sortDir = -1, page = 0, q = '';

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
    r.maxed = r.pri >= LIMIT || r.gen >= LIMIT;
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
  maxed: { label: 'Maxed this cycle', test: r => r.maxed, note: 'Gave the $8,400 limit for the primary or the general to the campaign. The recognition list, and the first ask for the leadership committee or the next cycle.' },
  lapsed: { label: 'Lapsed, $1,000 and up', test: r => r.total >= 1000 && r.recency > 180, note: 'Gave at least $1,000 in total but nothing in the last six months. A personal re-engagement, not a blast.' },
  upgrade: { label: 'Upgrade candidates', test: r => r.gifts >= 3 && r.max <= 250 && r.total < 2500 && !r.maxed, note: 'Three or more gifts, none above $250. Frequency without size: the clearest sign a larger ask will land.' },
  onetime: { label: 'One large gift, then silence', test: r => r.gifts === 1 && r.max >= 1000 && r.recency > 90, note: 'A single gift of $1,000 or more and nothing since. Thank first, then ask.' },
  leadonly: { label: 'Battleground only', test: r => r.lead >= 1000 && r.camp === 0, note: 'Gave $1,000 or more to Project Battleground Georgia and never to the campaign. Already comfortable with large, unlimited gifts.' },
  camponly: { label: 'Campaign only, $2,500 and up', test: r => r.camp >= 2500 && r.lead === 0, note: 'Significant campaign donors who were never asked for the leadership committee.' },
  recent: { label: 'New in the last 60 days', test: r => r.tenure <= 60, note: 'First gift in the final stretch. Steward now; they are the next cycle’s base.' },
  publicemp: { label: 'Public or university employer', test: r => r.public, note: 'Employer or occupation suggests a government or university salary (state, county, city, school system, federal, public and private universities). Capacity can be matched to published salary data; that match is the next build.' },
  capacity: { label: 'Salary known', test: r => r.salary > 0, note: 'Donors matched to a published Georgia public salary (Open Georgia, fiscal 2025: state agencies, the university system and school boards; counties, cities and federal employers are not covered). Giving as a share of salary shows who has room: the median matched donor gave about a quarter of one percent of salary. Matches are by name plus employer or a unique name; treat them as leads, not facts.' },
  all: { label: 'All donors', test: () => true, note: 'Every itemized donor across both committees, scored by amount, recency and frequency.' }
};

function render() {
  const main = $('#main'); const rows = DONORS;
  const counts = Object.fromEntries(Object.entries(SEGS).map(([k, s]) => [k, rows.filter(s.test)]));
  const S = SEGS[seg]; let list = counts[seg];
  if (q) { const toks = q.toLowerCase().split(/\s+/).filter(Boolean); list = list.filter(r => { const hay = (r.name + ' ' + r.emp + ' ' + r.occ + ' ' + r.city + ' ' + r.zip).toLowerCase(); return toks.every(t => hay.includes(t)); }); }
  list = [...list].sort((a, b) => { const va = a[sortK], vb = b[sortK]; if (typeof va === 'number') return (va - vb) * sortDir || b.total - a.total; return (String(va) < String(vb) ? -1 : 1) * sortDir; });
  const PS = 50, pages = Math.max(1, Math.ceil(list.length / PS)); page = Math.min(page, pages - 1); const pg = list.slice(page * PS, (page + 1) * PS);
  const sum = arr => arr.reduce((s, r) => s + r.total, 0);
  const th = (k, l, num) => `<th class="${num ? 'num' : ''} ${sortK === k ? 'on' : ''}" data-k="${k}">${l}${sortK === k ? (sortDir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
  const tile = (l, v, d) => `<div class="tile"><div class="l">${l}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
  main.innerHTML = `
  <h1>Ask lists</h1><p class="sub">Itemized donors to Keisha for Governor and Project Battleground Georgia, combined, as filed through ${dayStr(ASOF)}. Not public: built from public filings but organized for fundraising.</p>
  <div class="notice">Waiting on two inputs that complete this view: the <b>ActBlue export</b> (adds every small-dollar donor, fundraising pages and reference codes for who raised what) and the <b>public-salary match</b> for capacity. The lists below work today from the Commission’s itemized record.</div>
  <div class="kpis">${tile('Donors scored', fmtN(rows.length), `${fmt$(sum(rows))} itemized, both committees`)}${tile('Maxed this cycle', fmtN(counts.maxed.length), fmt$(sum(counts.maxed)))}${tile('Lapsed $1,000+', fmtN(counts.lapsed.length), fmt$(sum(counts.lapsed)) + ' lifetime')}${tile('Upgrade candidates', fmtN(counts.upgrade.length), 'frequent, small')}${tile('Battleground only', fmtN(counts.leadonly.length), fmt$(sum(counts.leadonly)))}${tile('Salary known', fmtN(counts.capacity.length), 'matched to Open Georgia (state, universities, school boards)')}</div>
  <div class="segs">${Object.entries(SEGS).map(([k, s]) => `<button class="seg ${seg === k ? 'on' : ''}" data-seg="${k}">${s.label} <b>${fmtN(counts[k].length)}</b></button>`).join('')}</div>
  <div class="card"><h3>${S.label}</h3><div class="note">${S.note} <b>Suggested ask</b> is a step above the donor’s demonstrated giving, rounded to a standard band, capped at the $8,400 limit; <b>score</b> weighs amount (double), recency and frequency on a 1 to 20 scale.</div>
    <div class="bar"><input type="search" id="q" placeholder="Search name, employer, occupation, city or ZIP" value="${esc(q)}"><button class="btn" id="csv">Copy this list as CSV</button><span class="small muted">${fmtN(list.length)} donors, ${fmt$(sum(list))}</span></div>
    <div class="tw"><table><thead><tr>${th('score', 'Score', 1)}${th('name', 'Donor')}<th>Location</th><th>Employer / occupation</th>${th('camp', 'Campaign', 1)}${th('lead', 'Battleground', 1)}${th('total', 'Total', 1)}${th('gifts', 'Gifts', 1)}${th('max', 'Largest', 1)}${th('last', 'Last gift', 1)}${th('ask', 'Suggested ask', 1)}${seg === 'capacity' ? th('salary', 'Public salary', 1) + th('givingPct', 'Gave as % of salary', 1) : ''}</tr></thead><tbody>
    ${pg.map(r => `<tr><td class="num"><b>${r.score}</b></td><td><b>${esc(r.name)}</b>${r.maxed ? '<span class="pill ok">maxed</span>' : ''}${r.public ? '<span class="pill">public</span>' : ''}${r.recency > 180 && r.total >= 1000 ? '<span class="pill hot">lapsed</span>' : ''}</td><td>${esc(r.city)}${r.state ? ', ' + r.state : ''}</td><td class="small">${esc(r.emp)}${r.occ ? `<div class="muted">${esc(r.occ)}</div>` : ''}</td><td class="num">${r.camp ? fmt$(r.camp) : '<span class="muted">—</span>'}</td><td class="num">${r.lead ? fmt$(r.lead) : '<span class="muted">—</span>'}</td><td class="num"><b>${fmt$(r.total)}</b></td><td class="num">${fmtN(r.gifts)}</td><td class="num">${fmt$(r.max)}</td><td class="num">${dayStr(r.last)}<div class="small muted">${r.recency} days ago</div></td><td class="num"><b>${fmt$(r.ask)}</b><div class="small muted">${esc(r.askNote)}</div></td>${seg === 'capacity' ? `<td class="num">${fmt$(r.salary)}<div class="small muted">${esc(r.salaryTitle)}, ${esc(r.salaryOrg)}<br>${esc(r.salaryConf)}</div></td><td class="num">${(r.givingPct * 100).toFixed(2)}%</td>` : ''}</tr>`).join('')}
    </tbody></table></div>
    <div class="pager"><button class="btn" id="prev" ${page === 0 ? 'disabled' : ''}>Previous</button><span>Page ${page + 1} of ${pages}</span><button class="btn" id="next" ${page >= pages - 1 ? 'disabled' : ''}>Next</button></div></div>
  <div class="card"><h3>What arrives with ActBlue</h3><div class="note">Every donor including those under $100 (not itemized by the Commission); <b>raised</b> alongside <b>gave</b>, from fundraising pages and reference codes, so hosts who worked to bring others in are credited; event-day attribution; recurring base and retention; channel mix; and a nightly reconciliation of ActBlue against the Commission filings once the CSV API or webhooks are connected.</div></div>`;
  main.querySelectorAll('[data-seg]').forEach(b => b.addEventListener('click', () => { seg = b.dataset.seg; page = 0; render(); }));
  main.querySelectorAll('th[data-k]').forEach(h => h.addEventListener('click', () => { const k = h.dataset.k; if (sortK === k) sortDir *= -1; else { sortK = k; sortDir = k === 'name' ? 1 : -1; } page = 0; render(); }));
  const qi = $('#q'); let t; qi.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { q = qi.value.trim(); page = 0; const pos = qi.selectionStart; render(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); }, 250); });
  $('#prev').addEventListener('click', () => { page--; render(); }); $('#next').addEventListener('click', () => { page++; render(); });
  $('#csv').addEventListener('click', async () => { const qv = v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }; const out = [['Segment', 'Score', 'Donor', 'City', 'State', 'ZIP', 'Employer', 'Occupation', 'Campaign', 'Battleground', 'Total', 'Gifts', 'Largest gift', 'First gift', 'Last gift', 'Days since last', 'Maxed', 'Public employer', 'Suggested ask', 'Ask note', 'Public salary', 'Salary title', 'Salary organization', 'Match confidence'].join(',')]; for (const r of list) out.push([S.label, r.score, r.name, r.city, r.state, r.zip, r.emp, r.occ, r.camp.toFixed(2), r.lead.toFixed(2), r.total.toFixed(2), r.gifts, r.max.toFixed(2), dayStr(r.first), dayStr(r.last), r.recency, r.maxed ? 'yes' : '', r.public ? 'yes' : '', r.ask, r.askNote, r.salary || '', r.salaryTitle || '', r.salaryOrg || '', r.salaryConf || ''].map(qv).join(',')); try { await navigator.clipboard.writeText(out.join('\n')); toast(`Copied ${fmtN(list.length)} donors`); } catch (e) { toast('Clipboard blocked by the browser'); } });
}

(async () => {
  try {
    FIELD = await loadJSON('../data/field.json');
    const v = encodeURIComponent(FIELD.generated || '');
    const [camp, lead] = await Promise.all([loadJSON(`../data/cand-${CAMP}.json?v=${v}`), loadJSON(`../data/cand-${LEAD}.json?v=${v}`)]);
    DONORS = build(records(camp, CAMP), records(lead, LEAD));
    try { const S = await loadJSON('salary.json'); const byKey = new Map(S.matches.map(m => [m.key + '|GA', m])); for (const r of DONORS) { const m = byKey.get(r.k); if (m) { r.salary = m.salary; r.salaryTitle = m.title; r.salaryOrg = m.org; r.salaryConf = m.confidence; r.givingPct = r.total / m.salary; } } SALARY_META = S; } catch (e) { console.warn('salary file not loaded', e); }
    render();
  } catch (e) { $('#main').innerHTML = `<div class="loading">Could not load donor data: ${esc(e.message)}</div>`; }
})();
