// Screens: one name or company → giving to the campaign and Battleground, state payments, lobbyist registrations, board seats.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt$ = v => (v < 0 ? '-' : '') + '$' + Math.round(Math.abs(v || 0)).toLocaleString();
const fmtK = v => v >= 1e9 ? '$' + (v / 1e9).toFixed(1) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'K' : fmt$(v);
const fmtN = v => Math.round(v || 0).toLocaleString();
const EPOCH = Date.UTC(2025, 0, 1);
const dayStr = d => { if (d == null || d < 0) return '—'; const t = new Date(EPOCH + d * 86400000); return `${String(t.getUTCMonth() + 1).padStart(2, '0')}/${String(t.getUTCDate()).padStart(2, '0')}/${t.getUTCFullYear()}`; };
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(() => t.style.display = 'none', 2200); };
let S, N, view = 'vendors', q = '';
const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\b(INCORPORATED|INC|LLC|LLP|LP|PLLC|PC|CORPORATION|CORP|CO|COMPANY|LTD|THE|OF|AND|GROUP|HOLDINGS)\b/g, ' ').replace(/\s+/g, ' ').trim();
const toks = s => norm(s).split(' ').filter(t => t.length > 1);
// a person typed "First Last" or "Last, First"; registries hold "Last, First" (donors) and "First Last" (boards)
function nameForms(s) {
  s = s.trim(); if (!s) return [];
  if (s.includes(',')) { const [l, f] = s.split(',').map(x => x.trim()); return [`${l}, ${f}`, `${f} ${l}`]; }
  const p = s.split(/\s+/); if (p.length >= 2) return [`${p[p.length - 1]}, ${p.slice(0, -1).join(' ')}`, s];
  return [s];
}
const has = (hay, needle) => { const h = norm(hay), ts = toks(needle); return ts.length > 0 && ts.every(t => h.includes(t)); };

function search() {
  const r = { donors: [], pbg: [], vendors: [], vendorHits: [], lobbyists: [], lobHits: [], clients: [], clientHits: [], boards: [], boardHits: [] };
  if (toks(q).length === 0) return r;
  const forms = nameForms(q);
  const m = s => forms.some(f => has(s, f)) || has(s, q);
  r.donors = N.list.filter(d => m(d.name) || (toks(q).length > 1 && has(d.emp, q))).slice(0, 40);
  r.pbg = S.index.pbg.filter(d => m(d.n)).slice(0, 40);
  r.vendors = S.index.vendors.filter(v => has(v.v, q)).slice(0, 40);
  r.vendorHits = S.vendors.filter(v => has(v.vendor, q) || (v.aliases || []).some(a => has(a, q)) || v.names.some(n => m(n)));
  r.lobbyists = S.index.lobbyists.filter(l => m(l.l)).slice(0, 40);
  r.lobHits = S.lobbyists.filter(l => m(l.lobbyist) || m(l.donorName));
  r.clients = S.index.clients.filter(c => has(c.c, q)).slice(0, 40);
  r.clientHits = S.clients.filter(c => has(c.client, q));
  r.boards = S.index.boards.filter(b => m(b.n) || has(b.b, q)).slice(0, 60);
  r.boardHits = S.boards.filter(b => m(b.name) || m(b.donorName));
  return r;
}

function fact(l, v, d) { return `<div class="fact"><div class="l">${l}</div><div class="v">${v}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`; }
function resultCard(r) {
  const any = Object.values(r).some(a => a.length);
  if (!any) return `<div class="card"><h3>No match</h3><div class="note">Nothing in the campaign books at $250+, the Battleground filings, the vendor payments, the lobbyist index or the board announcements matches “${esc(q)}”. Try a shorter form of the name or the company without its suffix.</div></div>`;
  let h = '';
  if (r.donors.length || r.pbg.length) {
    h += `<div class="card"><h3>Giving</h3><div class="note">Campaign figures are from the books (NGP, donors at $250+ or event donors); Battleground figures are as filed with the Commission. Names open the public record.</div>
    ${r.donors.map(d => `<div class="hit"><h4><a href="/?q=${encodeURIComponent(d.name)}#donors" target="_blank" rel="noopener">${esc(d.name)}</a> <span class="small muted">${esc(d.city)}${d.state ? ', ' + d.state : ''}${d.emp ? ' · ' + esc(d.emp) : ''}${d.occ ? ', ' + esc(d.occ) : ''}</span></h4>
      <div class="facts">${fact('Campaign', fmt$(d.total), `${d.n} gifts, last ${dayStr(d.last)}`)}${fact('Battleground (filed)', (d.lead || d.pbgFiled) ? fmt$(d.lead || d.pbgFiled) : '—')}${fact('Both', fmt$(d.total + (d.lead || d.pbgFiled || 0)))}${fact('Largest gift', fmt$(d.max))}${d.events.length ? fact('Events', d.events.length, d.events.slice(0, 3).join(', ')) : ''}</div></div>`).join('')}
    ${r.pbg.filter(p => !r.donors.some(d => norm(d.name) === norm(p.n))).map(p => `<div class="hit"><h4><a href="/?q=${encodeURIComponent(p.n)}#donors" target="_blank" rel="noopener">${esc(p.n)}</a> <span class="small muted">${esc(p.s)}</span> <span class="pill">Battleground only</span></h4><div class="facts">${fact('Battleground (filed)', fmt$(p.t))}${fact('Campaign', '—', 'not in the books at $250+')}</div></div>`).join('')}</div>`;
  }
  if (r.vendorHits.length || r.vendors.length) {
    h += `<div class="card"><h3>State payments</h3><div class="note">Open Georgia payments to the vendor, FY2024 and FY2025, state agencies and authorities.</div>
    ${r.vendorHits.map(v => vendorRow(v)).join('')}
    ${r.vendors.filter(v => !r.vendorHits.some(x => norm(x.vendor) === norm(v.v) || (x.aliases || []).some(a => norm(a) === norm(v.v)))).slice(0, 15).map(v => `<div class="hit"><h4>${esc(v.v)}</h4><div class="facts">${fact('Paid by the state', fmt$(v.paid), `${v.ag} agenc${v.ag === 1 ? 'y' : 'ies'}, FY2024 to FY2025`)}${fact('Giving found', 'none', 'no donor or employee match')}</div></div>`).join('')}</div>`;
  }
  if (r.lobHits.length || r.lobbyists.length || r.clientHits.length || r.clients.length) {
    h += `<div class="card"><h3>Lobbying</h3><div class="note">2026 lobbyist registrations with the Commission: who is registered, for whom.</div>
    ${r.lobHits.map(l => lobRow(l)).join('')}
    ${r.lobbyists.filter(l => !r.lobHits.some(x => norm(x.lobbyist) === norm(l.l))).map(l => `<div class="hit"><h4>${esc(l.l)} <span class="pill">registered lobbyist</span>${l.a ? '' : '<span class="pill">terminated</span>'}</h4><div class="small">${l.c.map(esc).join(' · ')}${l.c.length >= 12 ? ' …' : ''}</div><div class="small muted" style="margin-top:4px">No giving found under this name.</div></div>`).join('')}
    ${r.clientHits.map(c => clientRow(c)).join('')}
    ${r.clients.filter(c => !r.clientHits.some(x => norm(x.client) === norm(c.c))).slice(0, 15).map(c => `<div class="hit"><h4>${esc(c.c)} <span class="pill">lobbying client</span></h4><div class="small muted">${c.n} registered lobbyist${c.n === 1 ? '' : 's'}; no giving found under this name or its employees.</div></div>`).join('')}</div>`;
  }
  if (r.boardHits.length || r.boards.length) {
    h += `<div class="card"><h3>Boards, commissions and authorities</h3><div class="note">From the Governor's appointment announcements, 2019 to 2026. Terms and current status are not published; treat an appointment as current unless you know otherwise.</div>
    ${r.boardHits.map(b => boardRow(b)).join('')}
    ${r.boards.filter(b => !r.boardHits.some(x => x.name === b.n && x.board === b.b)).map(b => `<div class="hit"><h4>${esc(b.n)} <span class="small muted">${esc(b.b)}</span>${b.r ? '<span class="pill">reappointed</span>' : ''}</h4><div class="small muted">Appointed ${esc(b.d)}. No giving found under this name.</div></div>`).join('')}</div>`;
  }
  return h;
}
function vendorRow(v) {
  const direct = v.gaveCamp + v.gavePbg, emp = v.employeeCamp + v.employeePbg;
  return `<div class="hit"><h4>${esc(v.vendor)} ${v.kind === 'gave directly' ? '<span class="pill hot">vendor gave</span>' : v.kind === 'individual paid by the state' ? '<span class="pill gold">individual paid by the state</span>' : '<span class="pill">employees gave</span>'}${v.aliases && v.aliases.length ? `<div class="small muted">also paid as ${v.aliases.map(esc).join(', ')}</div>` : ''}</h4>
  <div class="facts">${fact('Paid by the state', fmt$(v.paid), `FY2024 ${fmtK(v.fy2024)}, FY2025 ${fmtK(v.fy2025)}`)}${fact('Agencies', v.nAgencies, v.agencies.slice(0, 3).join('; '))}${direct ? fact('Gave as an entity', fmt$(direct), `campaign ${fmt$(v.gaveCamp)}, Battleground ${fmt$(v.gavePbg)}`) : ''}${emp ? fact('Employees gave', fmt$(emp), `${v.employees} donor${v.employees === 1 ? '' : 's'}; campaign ${fmt$(v.employeeCamp)}, Battleground ${fmt$(v.employeePbg)}`) : ''}</div>
  ${v.names.length ? `<div class="small">${v.names.map(n => `<a href="/?q=${encodeURIComponent(n)}#donors" target="_blank" rel="noopener">${esc(n)}</a>`).join(' · ')}</div>` : ''}</div>`;
}
function lobRow(l) {
  return `<div class="hit"><h4>${esc(l.lobbyist)} <span class="pill hot">lobbyist who gave</span>${l.active ? '' : '<span class="pill">terminated</span>'}</h4>
  <div class="facts">${fact('Campaign', fmt$(l.gaveCamp))}${fact('Battleground (filed)', fmt$(l.gavePbg))}${fact('Clients', l.nClients)}</div>
  <div class="small">${l.clients.map(esc).join(' · ')}${l.nClients > l.clients.length ? ' …' : ''}</div>
  <div class="small" style="margin-top:4px"><a href="/?q=${encodeURIComponent(l.donorName)}#donors" target="_blank" rel="noopener">Public record</a></div></div>`;
}
function clientRow(c) {
  const direct = c.gaveCamp + c.gavePbg, emp = c.employeeCamp + c.employeePbg;
  return `<div class="hit"><h4>${esc(c.client)} <span class="pill ${direct ? 'hot' : ''}">lobbying client${direct ? ' that gave' : ', employees gave'}</span></h4>
  <div class="facts">${fact('Registered lobbyists', c.lobbyists)}${direct ? fact('Gave as an entity', fmt$(direct), `campaign ${fmt$(c.gaveCamp)}, Battleground ${fmt$(c.gavePbg)}`) : ''}${emp ? fact('Employees gave', fmt$(emp), `${c.employees} donor${c.employees === 1 ? '' : 's'}`) : ''}</div>
  ${c.names.length ? `<div class="small">${c.names.map(n => `<a href="/?q=${encodeURIComponent(n)}#donors" target="_blank" rel="noopener">${esc(n)}</a>`).join(' · ')}</div>` : ''}</div>`;
}
function boardRow(b) {
  return `<div class="hit"><h4>${esc(b.name)} <span class="small muted">${esc(b.board)}</span> <span class="pill hot">appointee who gave</span>${b.reappointed ? '<span class="pill">reappointed</span>' : ''}</h4>
  <div class="facts">${fact('Campaign', fmt$(b.gaveCamp))}${fact('Battleground (filed)', fmt$(b.gavePbg))}${fact('Announced', esc(b.date))}</div>
  ${b.bio ? `<div class="small muted">${esc(b.bio)}</div>` : ''}<div class="small" style="margin-top:4px"><a href="/?q=${encodeURIComponent(b.donorName)}#donors" target="_blank" rel="noopener">Public record</a>${b.url ? ` · <a href="${esc(b.url)}" target="_blank" rel="noopener">Announcement</a>` : ''}</div></div>`;
}

const VIEWS = {
  vendors: ['Vendors who gave', 'State vendors that gave as an entity, individuals paid by the state who gave, and large vendors whose employees gave. Ordered with entity giving first. "Employees gave" is context, not a flag; it is listed only for vendors paid $250,000 or more whose employees gave $2,500 or more.'],
  lobbyists: ['Lobbyists who gave', 'Registered 2026 lobbyists whose name matches a donor to the campaign or to Battleground, with the clients they represent.'],
  clients: ['Lobbying clients that gave', 'Companies and groups that have registered lobbyists and that gave as an entity, or whose employees gave.'],
  boards: ['Appointees who gave', 'People named to boards, commissions and authorities in the Governor\'s announcements since 2019 who match a donor. Matched by name; confirm before relying on it.'],
};
function listBody() {
  if (view === 'vendors') return `<div class="tw"><table><thead><tr><th>Vendor</th><th>How</th><th class="num">Paid FY24–25</th><th class="num">Agencies</th><th class="num">Gave as entity</th><th class="num">Employees gave</th><th>Donors</th></tr></thead><tbody>${S.vendors.map(v => `<tr><td><b>${esc(v.vendor)}</b>${v.aliases && v.aliases.length ? `<div class="small muted">${v.aliases.slice(0, 2).map(esc).join(', ')}</div>` : ''}</td><td class="small">${esc(v.kind)}</td><td class="num">${fmt$(v.paid)}</td><td class="num">${v.nAgencies}</td><td class="num">${(v.gaveCamp + v.gavePbg) ? `<b>${fmt$(v.gaveCamp + v.gavePbg)}</b>` : '<span class="muted">—</span>'}</td><td class="num">${(v.employeeCamp + v.employeePbg) ? `${fmt$(v.employeeCamp + v.employeePbg)}<div class="small muted">${v.employees} donors</div>` : '<span class="muted">—</span>'}</td><td class="small">${v.names.slice(0, 3).map(n => `<a href="/?q=${encodeURIComponent(n)}#donors" target="_blank" rel="noopener">${esc(n)}</a>`).join('<br>')}</td></tr>`).join('')}</tbody></table></div>`;
  if (view === 'lobbyists') return `<div class="tw"><table><thead><tr><th>Lobbyist</th><th class="num">Campaign</th><th class="num">Battleground</th><th class="num">Clients</th><th>Represents</th></tr></thead><tbody>${S.lobbyists.map(l => `<tr><td><b>${esc(l.lobbyist)}</b>${l.active ? '' : '<span class="pill">terminated</span>'}<div class="small"><a href="/?q=${encodeURIComponent(l.donorName)}#donors" target="_blank" rel="noopener">record</a></div></td><td class="num">${fmt$(l.gaveCamp)}</td><td class="num">${fmt$(l.gavePbg)}</td><td class="num">${l.nClients}</td><td class="small">${l.clients.slice(0, 6).map(esc).join(' · ')}${l.nClients > 6 ? ' …' : ''}</td></tr>`).join('')}</tbody></table></div>`;
  if (view === 'clients') return `<div class="tw"><table><thead><tr><th>Client</th><th class="num">Lobbyists</th><th class="num">Gave as entity</th><th class="num">Employees gave</th><th>Donors</th></tr></thead><tbody>${S.clients.map(c => `<tr><td><b>${esc(c.client)}</b></td><td class="num">${c.lobbyists}</td><td class="num">${(c.gaveCamp + c.gavePbg) ? `<b>${fmt$(c.gaveCamp + c.gavePbg)}</b>` : '<span class="muted">—</span>'}</td><td class="num">${(c.employeeCamp + c.employeePbg) ? `${fmt$(c.employeeCamp + c.employeePbg)}<div class="small muted">${c.employees} donors</div>` : '<span class="muted">—</span>'}</td><td class="small">${c.names.slice(0, 3).map(n => `<a href="/?q=${encodeURIComponent(n)}#donors" target="_blank" rel="noopener">${esc(n)}</a>`).join('<br>')}</td></tr>`).join('')}</tbody></table></div>`;
  if (view === 'boards') return S.counts.appointments ? `<div class="tw"><table><thead><tr><th>Appointee</th><th>Board</th><th>Announced</th><th class="num">Campaign</th><th class="num">Battleground</th></tr></thead><tbody>${S.boards.map(b => `<tr><td><b>${esc(b.name)}</b>${b.reappointed ? '<span class="pill">reappointed</span>' : ''}<div class="small"><a href="/?q=${encodeURIComponent(b.donorName)}#donors" target="_blank" rel="noopener">record</a></div></td><td class="small">${esc(b.board)}</td><td class="small">${esc(b.date)}</td><td class="num">${fmt$(b.gaveCamp)}</td><td class="num">${fmt$(b.gavePbg)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="note">The board roster has not been loaded yet.</div>';
}
function csvOf() {
  const qv = v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  let head, rows;
  if (view === 'vendors') { head = ['Vendor', 'How', 'Paid FY2024', 'Paid FY2025', 'Agencies', 'Gave campaign', 'Gave Battleground', 'Employees gave campaign', 'Employees gave Battleground', 'Employee donors', 'Names']; rows = S.vendors.map(v => [v.vendor, v.kind, v.fy2024, v.fy2025, v.agencies.join('; '), v.gaveCamp, v.gavePbg, v.employeeCamp, v.employeePbg, v.employees, v.names.join('; ')]); }
  else if (view === 'lobbyists') { head = ['Lobbyist', 'Active', 'Campaign', 'Battleground', 'Clients']; rows = S.lobbyists.map(l => [l.lobbyist, l.active ? 'yes' : 'no', l.gaveCamp, l.gavePbg, l.clients.join('; ')]); }
  else if (view === 'clients') { head = ['Client', 'Lobbyists', 'Gave campaign', 'Gave Battleground', 'Employees gave campaign', 'Employees gave Battleground', 'Employee donors', 'Names']; rows = S.clients.map(c => [c.client, c.lobbyists, c.gaveCamp, c.gavePbg, c.employeeCamp, c.employeePbg, c.employees, c.names.join('; ')]); }
  else { head = ['Appointee', 'Board', 'Announced', 'Reappointed', 'Campaign', 'Battleground', 'Announcement']; rows = S.boards.map(b => [b.name, b.board, b.date, b.reappointed ? 'yes' : '', b.gaveCamp, b.gavePbg, b.url]); }
  return [head.join(','), ...rows.map(r => r.map(qv).join(','))].join('\n');
}

function render() {
  const main = $('#main'); const c = S.counts; const r = search();
  main.innerHTML = `
  <h1>Screens</h1><p class="sub">Before an appointment, a contract announcement or a meeting: one name or company, and what the record says. Campaign giving from the books, Battleground as filed, state payments from Open Georgia, lobbyist registrations from the Commission, board seats from the Governor's announcements. Matches are by name; confirm before you act on one.</p>
  <div class="searchbox"><input type="search" id="q" placeholder="Name or company — e.g. Deloitte, Georgia Power, Tharon Johnson" value="${esc(q)}" autofocus><div class="hint">Data through ${dayStr(S.asof)}. ${fmtN(c.vendors)} vendors, ${fmtN(c.lobbyists)} lobbyists and ${fmtN(c.clients)} clients, ${fmtN(c.appointments)} appointments, ${fmtN(N.list.length)} donors at $250+ and ${fmtN(S.index.pbg.length)} Battleground donors on file.</div></div>
  <div id="results">${q ? resultCard(r) : ''}</div>
  <div class="kpis">${[['Vendors who gave', c.vendorHits, 'entity, individual or employees'], ['Lobbyists who gave', c.lobbyistHits, `of ${fmtN(c.lobbyists)} registered for 2026`], ['Lobbying clients that gave', c.clientHits, `of ${fmtN(c.clients)} clients`], ['Appointees who gave', c.boardHits, c.appointments ? `of ${fmtN(c.appointments)} appointments since 2019` : 'roster not loaded yet']].map(([l, v, d]) => `<div class="tile"><div class="l">${l}</div><div class="v">${fmtN(v)}</div><div class="d">${d}</div></div>`).join('')}</div>
  <div class="segs">${Object.entries(VIEWS).map(([k, v]) => `<button class="seg ${view === k ? 'on' : ''}" data-v="${k}">${v[0]}</button>`).join('')}</div>
  <div class="card"><h3>${VIEWS[view][0]}</h3><div class="note">${VIEWS[view][1]}</div><div class="bar"><button class="btn" id="csv">Copy as CSV</button></div>${listBody()}</div>`;
  main.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { view = b.dataset.v; render(); }));
  const qi = $('#q'); let t; qi.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { q = qi.value; const pos = qi.selectionStart; $('#results').innerHTML = q ? resultCard(search()) : ''; history.replaceState(null, '', q ? '#q=' + encodeURIComponent(q) : location.pathname); }, 200); });
  $('#csv').addEventListener('click', async () => { try { await navigator.clipboard.writeText(csvOf()); toast('Copied'); } catch (e) { toast('Clipboard blocked by the browser'); } });
}
(async () => {
  try {
    const [a, b] = await Promise.all([fetch('/finance/screens.json', { cache: 'no-cache' }), fetch('/finance/ngp.json', { cache: 'no-cache' })]);
    if (!a.ok) throw new Error('screens.json ' + a.status); S = await a.json(); N = b.ok ? await b.json() : { list: [] };
    const hm = (location.hash || '').match(/^#q=(.+)$/); if (hm) q = decodeURIComponent(hm[1]);
    render();
  } catch (e) { $('#main').innerHTML = `<div class="loading">Could not load: ${esc(e.message)}</div>`; }
})();
