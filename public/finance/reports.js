// Finance reports: pick a dataset, filter, choose columns, export (CSV, Excel, print).
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt$ = v => v == null || v === '' ? '' : (v < 0 ? '-' : '') + '$' + Math.round(Math.abs(v)).toLocaleString();
const fmtN = v => v == null || v === '' ? '' : Math.round(v).toLocaleString();
const EPOCH = Date.UTC(2025, 0, 1);
const dayStr = d => { if (d == null || d === '') return ''; const t = new Date(EPOCH + d * 86400000); return `${String(t.getUTCMonth() + 1).padStart(2, '0')}/${String(t.getUTCDate()).padStart(2, '0')}/${t.getUTCFullYear()}`; };
const dayISO = d => { const t = new Date(EPOCH + d * 86400000); return t.toISOString().slice(0, 10); };
const isoDay = iso => iso ? Math.round((Date.parse(iso + 'T00:00:00Z') - EPOCH) / 86400000) : null;
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(() => t.style.display = 'none', 2200); };
const LIMIT = 8400;
let D, C, DS = {}, cur = { ds: 'donors', cols: null, sort: null, dir: -1, f: {} };

// ---- column types: money, int, day, text, bool ------------------------------------------------------
const COLS = {
  donors: [['name', 'Donor', 'text'], ['city', 'City', 'text'], ['state', 'State', 'text'], ['zip', 'ZIP', 'text'], ['emp', 'Employer', 'text'], ['occ', 'Occupation', 'text'], ['total', 'Campaign', 'money'], ['lead', 'Battleground', 'money'], ['both', 'Gave, both', 'money'], ['raised', 'Raised as host', 'money'], ['n', 'Gifts', 'int'], ['max', 'Largest gift', 'money'], ['pri', 'Primary', 'money'], ['gen', 'General', 'money'], ['maxed', 'Maxed', 'bool'], ['first', 'First gift', 'day'], ['last', 'Last gift', 'day'], ['days', 'Days since gift', 'int'], ['rec', 'Recurring', 'bool'], ['ch', 'Top channel', 'text'], ['evn', 'Events', 'int'], ['evlist', 'Event codes', 'text'], ['tier', 'Recognition tier', 'text']],
  gifts: [['event', 'Event', 'text'], ['code', 'Source code', 'text'], ['edate', 'Event date', 'day'], ['host', 'Host', 'text'], ['name', 'Donor', 'text'], ['city', 'City', 'text'], ['state', 'State', 'text'], ['emp', 'Employer', 'text'], ['occ', 'Occupation', 'text'], ['amt', 'Gift', 'money'], ['day', 'Gift date', 'day'], ['ft', 'First-time donor', 'bool'], ['life', 'Campaign lifetime', 'money'], ['pbg', 'Battleground', 'money'], ['both', 'Both', 'money']],
  events: [['date', 'Date', 'day'], ['name', 'Event', 'text'], ['location', 'Location', 'text'], ['host', 'Host', 'text'], ['code', 'Source code', 'text'], ['listed', 'On events list', 'bool'], ['invited', 'Invited', 'int'], ['confirmed', 'Confirmed', 'int'], ['amt', 'Raised', 'money'], ['n', 'Gifts', 'int'], ['donors', 'Donors', 'int'], ['firstTime', 'First-time donors', 'int'], ['hostLevel', 'Host-level gifts', 'int'], ['max', 'Largest gift', 'money'], ['perConfirmed', 'Per confirmed', 'money'], ['roomCamp', 'Room: campaign lifetime', 'money'], ['pbgAmt', 'Room: Battleground', 'money'], ['roomTotal', 'Room total', 'money'], ['hostMatch', 'Host match', 'text'], ['hostGave', 'Host gave', 'money']],
  hosts: [['host', 'Host', 'text'], ['events', 'Events', 'int'], ['raised', 'Raised', 'money'], ['donors', 'Donors', 'int'], ['firstTime', 'First-time donors', 'int'], ['gaveName', 'Matched donor', 'text'], ['gave', 'Gave', 'money'], ['ratio', 'Raised per $ given', 'num'], ['codesS', 'Source codes', 'text']],
  codes: [['code', 'Source code', 'text'], ['channel', 'Channel', 'text'], ['n', 'Gifts', 'int'], ['amt', 'Raised', 'money'], ['donors', 'Donors', 'int'], ['first', 'First gift', 'day'], ['last', 'Last gift', 'day']],
  months: [['month', 'Month', 'text'], ['amt', 'Raised', 'money'], ['n', 'Gifts', 'int'], ['donors', 'Donors', 'int'], ['newDonors', 'New donors', 'int'], ['events', 'Events', 'money'], ['digital', 'Campaign digital', 'money'], ['calltime', 'Call time / major donor', 'money'], ['partner', 'Partner and joint pages', 'money'], ['uncoded', 'Uncoded online', 'money'], ['checks', 'Checks and transfers', 'money'], ['bundler', 'Bundler links', 'money']],
  recon: [['month', 'Month', 'text'], ['ngp', 'NGP monetary', 'money'], ['ngpAll', 'NGP all types', 'money'], ['commission', 'Commission filed', 'money'], ['diff', 'Difference', 'money']],
  overLimit: [['name', 'Donor', 'text'], ['city', 'City', 'text'], ['state', 'State', 'text'], ['period', 'Election', 'text'], ['gave', 'Gave', 'money'], ['limit', 'Limit', 'money'], ['excess', 'Over by', 'money'], ['last', 'Last gift', 'day']],
  missingInfo: [['name', 'Donor', 'text'], ['city', 'City', 'text'], ['state', 'State', 'text'], ['total', 'Gave', 'money'], ['n', 'Gifts', 'int'], ['missing', 'Missing', 'text'], ['emp', 'Employer on file', 'text'], ['occ', 'Occupation on file', 'text'], ['last', 'Last gift', 'day']],
  household: [['household', 'Household', 'text'], ['period', 'Election', 'text'], ['n', 'Members', 'int'], ['gave', 'Gave, combined', 'money'], ['limit', 'Limit each', 'money'], ['membersS', 'Members', 'text']],
  duplicates: [['name', 'Donor', 'text'], ['zip', 'ZIP', 'text'], ['recordsN', 'Records', 'int'], ['total', 'Gave, all records', 'money'], ['recordsS', 'Record IDs and totals', 'text']],
  refunds: [['name', 'Donor', 'text'], ['amt', 'Refunded', 'money'], ['n', 'Gifts adjusted', 'int'], ['last', 'Last gift', 'day']],
};
const DSNAME = { donors: 'Donors', gifts: 'Event gifts', events: 'Events', hosts: 'Hosts', codes: 'Source codes', months: 'Raised by month', recon: 'Books vs filings', overLimit: 'Over the limit', missingInfo: 'Missing employer or occupation', household: 'Households at the limit', duplicates: 'Possible duplicate records', refunds: 'Refunds' };
const DSNOTE = {
  donors: 'Donors at $250+ lifetime plus every event donor, from the NGP export. Battleground is from the leadership committee\'s own NGP export, matched by exact name (the committees are separate databases).',
  gifts: 'Every gift that carried an event source code.', events: 'All fundraisers, from the events list and the contributions.', hosts: 'Hosts rolled up across their events; the donor match is by surname and is a lead to verify.',
  codes: 'Every source code in the export.', months: 'Monthly totals with the channel split.', recon: 'NGP against the Commission filings by month; the Commission line includes in-kind, so compare against NGP all types.',
  overLimit: 'Individuals whose gifts in one election exceed the limit ($8,400 primary or general; $4,800 runoff). Refund the excess or redesignate before the next filing.',
  missingInfo: 'Individuals over $100 aggregate with no employer or occupation on file. Georgia requires both; send the information request before filing.',
  household: 'Households where every member has reached the limit in an election. Not a violation; a list with nowhere left to give the campaign, and the first ask for the leadership committee.',
  duplicates: 'Same name and ZIP under more than one NGP record. Merge in NGP so limits and recognition are computed on one record.',
  refunds: 'Donors with refunds or adjustments recorded against their gifts.'
};
const PRESETS = [
  { id: 'recognition', label: 'Recognition tiers', note: 'Everyone by combined giving, tiered', ds: 'donors', cols: ['tier', 'name', 'city', 'state', 'total', 'lead', 'both', 'raised', 'last'], sort: 'both', f: { minBoth: 1000 } },
  { id: 'maxedNoLead', label: 'Maxed, nothing to Battleground', note: 'The leadership-committee ask list', ds: 'donors', cols: ['name', 'city', 'state', 'emp', 'occ', 'total', 'lead', 'last', 'evlist'], sort: 'total', f: { maxed: 'yes', leadZero: 'yes' } },
  { id: 'lapsed', label: 'Lapsed major donors', note: '$1,000+ with no gift in 180 days', ds: 'donors', cols: ['name', 'city', 'state', 'emp', 'total', 'lead', 'last', 'days', 'ch'], sort: 'total', f: { minTotal: 1000, minDays: 180 } },
  { id: 'firstTime30', label: 'First-time donors, last 30 days', note: 'The thank-you list', ds: 'donors', cols: ['name', 'city', 'state', 'total', 'n', 'first', 'ch', 'evlist'], sort: 'first', f: { firstWithin: 30 } },
  { id: 'hostsBoard', label: 'Host leaderboard', note: 'Raised vs gave', ds: 'hosts', cols: ['host', 'events', 'raised', 'donors', 'firstTime', 'gaveName', 'gave', 'ratio'], sort: 'raised', f: {} },
  { id: 'committee', label: 'Committee ranking', note: 'Weight of the room', ds: 'events', cols: ['name', 'date', 'host', 'amt', 'donors', 'hostLevel', 'roomCamp', 'pbgAmt', 'roomTotal'], sort: 'roomTotal', f: {} },
  { id: 'eventSummary', label: 'Event summary', note: 'Every event, one line', ds: 'events', cols: ['date', 'name', 'host', 'code', 'confirmed', 'amt', 'donors', 'firstTime', 'max', 'perConfirmed'], sort: 'date', dir: 1, f: {} },
  { id: 'overLimit', label: 'Over the limit', note: 'Refund or redesignate', ds: 'overLimit', cols: null, sort: 'excess', f: {} },
  { id: 'missingInfo', label: 'Missing employer / occupation', note: 'Information requests', ds: 'missingInfo', cols: null, sort: 'total', f: {} },
  { id: 'recon', label: 'Books vs filings', note: 'Month by month', ds: 'recon', cols: null, sort: 'month', dir: 1, f: {} },
  { id: 'months', label: 'Raised by month and channel', note: '', ds: 'months', cols: null, sort: 'month', dir: 1, f: {} },
];

function tierOf(v) { return v >= 100000 ? '1. $100,000 and up' : v >= 50000 ? '2. $50,000 to $99,999' : v >= 25000 ? '3. $25,000 to $49,999' : v >= 10000 ? '4. $10,000 to $24,999' : v >= LIMIT ? '5. $8,400 to $9,999' : v >= 2500 ? '6. $2,500 to $8,399' : v >= 1000 ? '7. $1,000 to $2,499' : '8. Under $1,000'; }

function buildDatasets() {
  const hostOf = new Map();
  for (const e of D.events) for (const c of e.hostCandidates) if (c.atEvent) hostOf.set(c.vanid, (hostOf.get(c.vanid) || 0) + e.amt);
  DS.donors = D.list.map(r => { const lead = r.lead || r.pbgFiled || 0; const both = r.total + lead; return { ...r, lead, both, raised: hostOf.get(r.v) || 0, maxed: r.pri >= LIMIT || r.gen >= LIMIT, days: D.asof - r.last, evn: r.events.length, evlist: r.events.join(' '), tier: tierOf(both) }; });
  DS.gifts = []; for (const e of D.events) for (const g of e.gifts) DS.gifts.push({ event: e.name, code: e.code, edate: e.date, host: e.host, ...g, both: g.life + (g.pbg || 0) });
  DS.events = D.events.map(e => ({ ...e, perConfirmed: e.confirmed ? e.amt / e.confirmed : null, hostMatch: e.hostCandidates[0]?.name || '', hostGave: e.hostCandidates[0]?.gave ?? null }));
  DS.hosts = D.hosts.filter(h => h.host !== '(no host named)').map(h => ({ ...h, ratio: h.gave ? +(h.raised / h.gave).toFixed(1) : null, codesS: h.codes.join(' ') }));
  DS.codes = D.codes;
  const CH = { events: 'Events', digital: 'Campaign digital', calltime: 'Call time / major donor', partner: 'Partner and joint pages', uncoded: 'Uncoded online', checks: 'Checks and transfers', bundler: 'Bundler links' };
  DS.months = Object.entries(D.months).sort().map(([m, o]) => { const r = { month: m, amt: o.amt, n: o.n, donors: o.donors, newDonors: o.newDonors }; for (const k in CH) r[k] = o.byChannel[CH[k]] || 0; return r; });
  DS.recon = (D.recon ? D.recon.months : []).filter(m => m.ngpAll || m.commission).map(m => ({ ...m, diff: m.ngpAll - m.commission }));
  DS.overLimit = C.overLimit; DS.missingInfo = C.missingInfo;
  DS.household = C.household.map(h => ({ ...h, membersS: h.members.map(m => `${m.name} ${fmt$(m.gave)}`).join('; ') }));
  DS.duplicates = C.duplicates.map(d => ({ ...d, recordsN: d.records.length, recordsS: d.records.map(r => `${r.v}: ${fmt$(r.gave)} (${r.n})`).join('; ') }));
  DS.refunds = C.refunds;
}

function colType(ds, k) { const c = COLS[ds].find(x => x[0] === k); return c ? c[2] : 'text'; }
function cell(v, t) { if (v == null || v === '') return ''; if (t === 'money') return fmt$(v); if (t === 'int') return fmtN(v); if (t === 'day') return dayStr(v); if (t === 'bool') return v ? 'yes' : ''; if (t === 'num') return String(v); return String(v); }
function raw(v, t) { if (v == null || v === '') return ''; if (t === 'money' || t === 'num') return +(+v).toFixed(2); if (t === 'int') return +v; if (t === 'day') return dayISO(v); if (t === 'bool') return v ? 'yes' : ''; return String(v); }

function rows() {
  const f = cur.f; let rs = DS[cur.ds] || [];
  const q = (f.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (q.length) rs = rs.filter(r => { const hay = Object.values(r).filter(v => typeof v === 'string').join(' ').toLowerCase(); return q.every(t => hay.includes(t)); });
  if (f.state) rs = rs.filter(r => (r.state || '') === f.state);
  const dk = { donors: 'last', gifts: 'day', events: 'date', codes: 'last', overLimit: 'last', missingInfo: 'last', refunds: 'last' }[cur.ds];
  if (dk && f.from) { const d = isoDay(f.from); rs = rs.filter(r => r[dk] != null && r[dk] >= d); }
  if (dk && f.to) { const d = isoDay(f.to); rs = rs.filter(r => r[dk] != null && r[dk] <= d); }
  const ak = { donors: 'both', gifts: 'amt', events: 'amt', hosts: 'raised', codes: 'amt', overLimit: 'gave', missingInfo: 'total', household: 'gave', duplicates: 'total', refunds: 'amt' }[cur.ds];
  if (ak && f.minAmt) rs = rs.filter(r => (r[ak] || 0) >= +f.minAmt);
  if (cur.ds === 'donors') {
    if (f.minBoth) rs = rs.filter(r => r.both >= +f.minBoth);
    if (f.minTotal) rs = rs.filter(r => r.total >= +f.minTotal);
    if (f.maxed === 'yes') rs = rs.filter(r => r.maxed); if (f.maxed === 'no') rs = rs.filter(r => !r.maxed);
    if (f.leadZero === 'yes') rs = rs.filter(r => !r.lead); if (f.leadZero === 'no') rs = rs.filter(r => r.lead > 0);
    if (f.minDays) rs = rs.filter(r => r.days >= +f.minDays);
    if (f.firstWithin) rs = rs.filter(r => D.asof - r.first <= +f.firstWithin);
    if (f.rec === 'yes') rs = rs.filter(r => r.rec);
    if (f.eventOnly === 'yes') rs = rs.filter(r => r.evn > 0);
    if (f.hostOnly === 'yes') rs = rs.filter(r => r.raised > 0);
  }
  if (cur.ds === 'gifts' && f.event) rs = rs.filter(r => r.code === f.event);
  if (cur.ds === 'events' && f.listedOnly === 'yes') rs = rs.filter(r => r.listed);
  const k = cur.sort, dir = cur.dir;
  if (k) rs = [...rs].sort((a, b) => { const va = a[k], vb = b[k]; if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1; if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir; return (String(va).toLowerCase() < String(vb).toLowerCase() ? -1 : 1) * dir; });
  return rs;
}
const DEFAULT_COLS = { donors: ['name', 'city', 'state', 'emp', 'total', 'lead', 'both', 'raised', 'n', 'last', 'ch'], gifts: ['event', 'edate', 'name', 'city', 'state', 'amt', 'day', 'ft', 'life', 'pbg'], events: ['date', 'name', 'host', 'code', 'confirmed', 'amt', 'donors', 'firstTime', 'max', 'roomTotal'], hosts: ['host', 'events', 'raised', 'donors', 'firstTime', 'gaveName', 'gave', 'ratio'] };
function activeCols() { const all = COLS[cur.ds].map(c => c[0]); return (cur.cols || DEFAULT_COLS[cur.ds] || all).filter(k => all.includes(k)); }

function filterChips() {
  const f = cur.f; const out = [];
  const add = (l, v) => { if (v !== undefined && v !== '' && v !== null) out.push(`<span class="chip">${esc(l)} <b>${esc(v)}</b></span>`); };
  add('search', f.q); add('from', f.from); add('to', f.to); add('state', f.state); add('minimum', f.minAmt && fmt$(+f.minAmt)); add('combined at least', f.minBoth && fmt$(+f.minBoth)); add('campaign at least', f.minTotal && fmt$(+f.minTotal));
  add('maxed', f.maxed); add('Battleground giving', f.leadZero === 'yes' ? 'none' : f.leadZero === 'no' ? 'some' : ''); add('no gift in', f.minDays && f.minDays + ' days'); add('first gift within', f.firstWithin && f.firstWithin + ' days');
  add('only', f.eventOnly === 'yes' ? 'event donors' : f.hostOnly === 'yes' ? 'hosts' : f.rec === 'yes' ? 'recurring' : ''); add('event', f.event); add('listed events only', f.listedOnly);
  return out.join('');
}
function render() {
  const main = $('#main'); const rs = rows(); const cols = activeCols(); const PREVIEW = 300;
  const states = [...new Set((DS[cur.ds] || []).map(r => r.state).filter(Boolean))].sort();
  const hasState = states.length > 0; const hasDate = ['donors', 'gifts', 'events', 'codes', 'overLimit', 'missingInfo', 'refunds'].includes(cur.ds);
  main.innerHTML = `
  <h1>Reports</h1><p class="sub">Pick a report or build one: choose the data, filter it, choose the columns, then export. Everything here is from the NGP export through ${dayStr(D.asof)} and the Commission filings; nothing leaves this page until you export it.</p>
  <div class="layout">
    <div class="panel">
      <h3>Saved reports</h3>
      <div class="presets">${PRESETS.map(p => `<button class="preset ${cur.preset === p.id ? 'on' : ''}" data-p="${p.id}">${esc(p.label)}${p.note ? `<small>${esc(p.note)}</small>` : ''}</button>`).join('')}</div>
      <h3 style="margin-top:16px">Build your own</h3>
      <label class="f">Data</label><select id="ds">${Object.keys(COLS).map(k => `<option value="${k}" ${cur.ds === k ? 'selected' : ''}>${DSNAME[k]}</option>`).join('')}</select>
      <label class="f">Search</label><input type="search" id="fq" value="${esc(cur.f.q || '')}" placeholder="name, employer, city, code…">
      ${hasDate ? `<label class="f">From</label><input type="date" id="ffrom" value="${esc(cur.f.from || '')}"><label class="f">To</label><input type="date" id="fto" value="${esc(cur.f.to || '')}">` : ''}
      ${hasState ? `<label class="f">State</label><select id="fstate"><option value="">All</option>${states.map(s => `<option ${cur.f.state === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}
      <label class="f">Minimum amount</label><input type="number" id="fmin" value="${esc(cur.f.minAmt || '')}" placeholder="0">
      ${cur.ds === 'donors' ? `<label class="f">Maxed to the campaign</label><select id="fmaxed"><option value="">Any</option><option value="yes" ${cur.f.maxed === 'yes' ? 'selected' : ''}>Maxed</option><option value="no" ${cur.f.maxed === 'no' ? 'selected' : ''}>Not maxed</option></select>
      <label class="f">Battleground giving</label><select id="flead"><option value="">Any</option><option value="yes" ${cur.f.leadZero === 'yes' ? 'selected' : ''}>None</option><option value="no" ${cur.f.leadZero === 'no' ? 'selected' : ''}>Some</option></select>
      <label class="f">No gift in at least (days)</label><input type="number" id="fdays" value="${esc(cur.f.minDays || '')}" placeholder="e.g. 180">
      <label class="f">First gift within (days)</label><input type="number" id="ffirst" value="${esc(cur.f.firstWithin || '')}" placeholder="e.g. 30">
      <label class="f">Only</label><select id="fonly"><option value="">Everyone</option><option value="event" ${cur.f.eventOnly === 'yes' ? 'selected' : ''}>Event donors</option><option value="host" ${cur.f.hostOnly === 'yes' ? 'selected' : ''}>Hosts</option><option value="rec" ${cur.f.rec === 'yes' ? 'selected' : ''}>Recurring donors</option></select>` : ''}
      ${cur.ds === 'gifts' ? `<label class="f">Event</label><select id="fevent"><option value="">All events</option>${D.events.filter(e => e.n).sort((a, b) => b.amt - a.amt).map(e => `<option value="${esc(e.code)}" ${cur.f.event === e.code ? 'selected' : ''}>${esc(e.name)} (${fmt$(e.amt)})</option>`).join('')}</select>` : ''}
      ${cur.ds === 'events' ? `<label class="f">Only events on the NGP list</label><select id="flisted"><option value="">No, include code-only events</option><option value="yes" ${cur.f.listedOnly === 'yes' ? 'selected' : ''}>Yes</option></select>` : ''}
      <label class="f">Columns</label><div class="cols">${COLS[cur.ds].map(c => `<label><input type="checkbox" data-col="${c[0]}" ${cols.includes(c[0]) ? 'checked' : ''}> ${esc(c[1])}</label>`).join('')}</div>
      <div class="bar" style="margin-top:10px"><button class="btn" id="reset">Clear filters</button></div>
    </div>
    <div class="results">
      <div class="bar"><div><b>${esc(cur.preset ? PRESETS.find(p => p.id === cur.preset).label : DSNAME[cur.ds])}</b> <span class="count">${fmtN(rs.length)} rows${rs.length > PREVIEW ? `, first ${PREVIEW} shown; exports include all` : ''}</span></div><span style="flex:1"></span><button class="btn primary" id="xcsv">Download CSV</button><button class="btn" id="xxlsx">Download Excel</button><button class="btn" id="xprint">Print / PDF</button><button class="btn" id="xcopy">Copy</button></div>
      <div class="note">${DSNOTE[cur.ds] || ''}</div>
      <div>${filterChips()}</div>
      <div class="printhead"><h2>${esc(cur.preset ? PRESETS.find(p => p.id === cur.preset).label : DSNAME[cur.ds])}</h2><div class="m">Keisha for Governor · Governor Pulse Finance · data through ${dayStr(D.asof)} · printed ${new Date().toLocaleDateString()} · ${fmtN(rs.length)} rows · prepared by Cura Consulting Group</div></div>
      <div class="tw"><table><thead><tr>${cols.map(k => { const c = COLS[cur.ds].find(x => x[0] === k); const num = ['money', 'int', 'num'].includes(c[2]); return `<th class="${num ? 'num' : ''} ${cur.sort === k ? 'on' : ''}" data-k="${k}">${esc(c[1])}${cur.sort === k ? (cur.dir < 0 ? ' ↓' : ' ↑') : ''}</th>`; }).join('')}</tr></thead>
      <tbody>${rs.slice(0, PREVIEW).map(r => `<tr>${cols.map(k => { const t = colType(cur.ds, k); const num = ['money', 'int', 'num'].includes(t); return `<td class="${num ? 'num' : t === 'day' ? 'd' : 't'}">${esc(cell(r[k], t))}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
      ${rs.length === 0 ? '<div class="note" style="padding:30px 0;text-align:center">No rows match these filters.</div>' : ''}
    </div>
  </div>`;
  main.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { const p = PRESETS.find(x => x.id === b.dataset.p); cur = { ds: p.ds, cols: p.cols, sort: p.sort, dir: p.dir || -1, f: { ...p.f }, preset: p.id }; render(); }));
  $('#ds').addEventListener('change', e => { cur = { ds: e.target.value, cols: null, sort: null, dir: -1, f: {}, preset: null }; render(); });
  const setF = (id, key, map) => { const el = $(id); if (!el) return; el.addEventListener('change', () => { cur.f[key] = map ? map(el.value) : el.value; cur.preset = null; render(); }); };
  let qt; const fq = $('#fq'); fq.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { cur.f.q = fq.value; const pos = fq.selectionStart; render(); $('#fq').focus(); $('#fq').setSelectionRange(pos, pos); }, 250); });
  setF('#ffrom', 'from'); setF('#fto', 'to'); setF('#fstate', 'state'); setF('#fmin', 'minAmt'); setF('#fmaxed', 'maxed'); setF('#flead', 'leadZero'); setF('#fdays', 'minDays'); setF('#ffirst', 'firstWithin'); setF('#fevent', 'event'); setF('#flisted', 'listedOnly');
  const fo = $('#fonly'); if (fo) fo.addEventListener('change', () => { cur.f.eventOnly = fo.value === 'event' ? 'yes' : ''; cur.f.hostOnly = fo.value === 'host' ? 'yes' : ''; cur.f.rec = fo.value === 'rec' ? 'yes' : ''; cur.preset = null; render(); });
  main.querySelectorAll('[data-col]').forEach(cb => cb.addEventListener('change', () => { const all = COLS[cur.ds].map(c => c[0]); const on = new Set(activeCols()); if (cb.checked) on.add(cb.dataset.col); else on.delete(cb.dataset.col); cur.cols = all.filter(k => on.has(k)); render(); }));
  main.querySelectorAll('th[data-k]').forEach(h => h.addEventListener('click', () => { const k = h.dataset.k; if (cur.sort === k) cur.dir *= -1; else { cur.sort = k; cur.dir = ['text'].includes(colType(cur.ds, k)) ? 1 : -1; } render(); }));
  $('#reset').addEventListener('click', () => { cur.f = {}; cur.preset = null; render(); });
  const fname = () => `${(cur.preset ? PRESETS.find(p => p.id === cur.preset).label : DSNAME[cur.ds]).replace(/[^\w]+/g, '_')}_${dayISO(D.asof)}`;
  const matrix = () => { const cs = activeCols(); const head = cs.map(k => COLS[cur.ds].find(c => c[0] === k)[1]); return { head, body: rows().map(r => cs.map(k => raw(r[k], colType(cur.ds, k)))) }; };
  const csvText = () => { const { head, body } = matrix(); const qv = v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }; return [head.join(','), ...body.map(r => r.map(qv).join(','))].join('\n'); };
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  $('#xcsv').addEventListener('click', () => { download(new Blob(['﻿' + csvText()], { type: 'text/csv;charset=utf-8' }), fname() + '.csv'); toast('CSV downloaded'); });
  $('#xcopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(csvText()); toast('Copied'); } catch (e) { toast('Clipboard blocked by the browser'); } });
  $('#xxlsx').addEventListener('click', () => {
    if (typeof XLSX === 'undefined') { toast('Excel library did not load; use CSV'); return; }
    const { head, body } = matrix(); const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
    const cs = activeCols(); ws['!cols'] = cs.map(k => ({ wch: colType(cur.ds, k) === 'text' ? 24 : 14 }));
    for (let r = 1; r <= body.length; r++) cs.forEach((k, ci) => { const t = colType(cur.ds, k); const ref = XLSX.utils.encode_cell({ r, c: ci }); if (ws[ref] && t === 'money') ws[ref].z = '$#,##0.00'; if (ws[ref] && t === 'int') ws[ref].z = '#,##0'; });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, DSNAME[cur.ds].slice(0, 31));
    const about = XLSX.utils.aoa_to_sheet([['Report', cur.preset ? PRESETS.find(p => p.id === cur.preset).label : DSNAME[cur.ds]], ['Committee', 'Keisha for Governor'], ['Data through', dayISO(D.asof)], ['Exported', new Date().toISOString().slice(0, 10)], ['Rows', body.length], ['Source', 'NGP VAN contribution export; Georgia Campaign Finance Commission filings'], ['Prepared by', 'Cura Consulting Group, Governor Pulse Finance'], ['Note', DSNOTE[cur.ds] || '']]);
    XLSX.utils.book_append_sheet(wb, about, 'About'); XLSX.writeFile(wb, fname() + '.xlsx'); toast('Excel downloaded');
  });
  $('#xprint').addEventListener('click', () => window.print());
}

(async () => {
  try {
    const [a, b] = await Promise.all([fetch('/finance/ngp.json', { cache: 'no-cache' }), fetch('/finance/compliance.json', { cache: 'no-cache' })]);
    if (!a.ok) throw new Error('ngp.json ' + a.status); D = await a.json(); C = b.ok ? await b.json() : { overLimit: [], missingInfo: [], household: [], duplicates: [], refunds: [], counts: {} };
    buildDatasets();
    const hp = (location.hash || '').match(/^#(\w+)$/); const p = hp && PRESETS.find(x => x.id === hp[1]);
    if (p) cur = { ds: p.ds, cols: p.cols, sort: p.sort, dir: p.dir || -1, f: { ...p.f }, preset: p.id }; else if (hp && COLS[hp[1]]) cur = { ds: hp[1], cols: null, sort: null, dir: -1, f: {}, preset: null }; else cur = { ds: 'donors', cols: null, sort: 'both', dir: -1, f: {}, preset: null };
    render();
  } catch (e) { $('#main').innerHTML = `<div class="loading">Could not load: ${esc(e.message)}</div>`; }
})();
