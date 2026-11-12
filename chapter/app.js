/* Chapter — shared shell: navigation, role gating, Ask search, data loading, formatting. */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = n => Math.round(n).toLocaleString('en-US');
const fmt$ = n => (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US');
const fmtB = n => n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(0) + 'M' : fmt$(n);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dLong = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); if (!d) return MON[m - 1] + ' ' + y; return `${MON[m - 1]} ${d}, ${y}`; };
const dShort = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return d ? `${MON[m - 1]} ${d}` : MON[m - 1] + ' ' + y; };
const AS_OF = '2026-11-12', INAUG = '2027-01-11', BUDGET_DUE = '2027-01-16';
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
const toast = m => { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); } t.textContent = m; t.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(() => t.style.display = 'none', 2200); };

const PAGES = [
  { id: 'ops', href: 'index.html', label: 'Operations', sect: 'Transition' },
  { id: 'watch', href: 'watch.html', label: 'Predecessor watch', sect: 'Transition', count: d => d.ops.eo_final90 },
  { id: 'inventory', href: 'inventory.html', label: 'Inventory', sect: 'Transition', count: d => d.ops.boards_total },
  { id: 'appointments', href: 'appointments.html', label: 'Appointments', sect: 'Transition' },
  { id: 'budget', href: 'budget.html', label: 'Budget sprint', sect: 'Transition', count: d => d.ops.days_to_budget + 'd' },
  { id: 'advisors', href: 'advisors.html', label: 'Advisors', sect: 'Operations' },
  { id: 'intake', href: 'intake.html', label: 'Intake', sect: 'Operations' },
  { id: 'guide', href: 'guide.html', label: 'Guide & roadmap', sect: 'Reference' },
];
const ROLES = {
  cos: { label: 'Chief of Staff', pages: PAGES.map(p => p.id) },
  principal: { label: 'Governor-elect', pages: ['ops', 'budget', 'appointments', 'guide'] },
  policy: { label: 'Policy Director', pages: ['ops', 'watch', 'inventory', 'budget', 'advisors', 'intake', 'guide'] },
  personnel: { label: 'Personnel Director', pages: ['ops', 'inventory', 'appointments', 'intake', 'guide'] },
  counsel: { label: 'General Counsel', pages: ['ops', 'watch', 'inventory', 'intake', 'guide'] },
  landing: { label: 'Agency landing team', pages: ['inventory', 'intake', 'guide'] },
};
let ROLE = localStorage.getItem('chapter.role') || 'cos';
const can = id => ROLES[ROLE].pages.includes(id);

let DATA = null;
async function loadData() {
  if (DATA) return DATA;
  const names = ['ops', 'watch', 'inventory', 'transition', 'budget'];
  const rs = await Promise.all(names.map(n => fetch('data/' + n + '.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(n + ' ' + r.status); return r.json(); })));
  DATA = Object.fromEntries(names.map((n, i) => [n, rs[i]])); return DATA;
}

function shell(pageId, title, crumb) {
  const d = DATA;
  const sects = [...new Set(PAGES.map(p => p.sect))];
  const navHtml = sects.map(s => `<div class="sect">${s}</div><div class="links">${PAGES.filter(p => p.sect === s && can(p.id)).map(p => `<a href="${p.href}" class="${p.id === pageId ? 'on' : ''}">${p.label}${p.count ? `<span class="cnt">${p.count(d)}</span>` : ''}</a>`).join('')}</div>`).join('');
  $('#nav').innerHTML = `<div class="brand"><div class="word">Chapter</div><div class="tag">Transition intelligence · Georgia</div></div>${navHtml}
    <div class="foot"><b>Georgia’s Promise</b><br>Governor-elect Bottoms<br>Day ${d.ops.transition_day} of transition · public data through ${dLong(AS_OF)}</div>`;
  $('#top').innerHTML = `<div class="crumb">${crumb || `<b>${esc(title)}</b>`}</div>
    <div class="ask"><svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg><input id="askq" type="search" placeholder="Ask Chapter: a name, a board, an order number, a budget line…" autocomplete="off"><div class="res" id="askres"></div></div>
    <div class="role"><span>Viewing as</span><select id="rolesel">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === ROLE ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
    <div class="clock"><b>${d.ops.days_to_inauguration}</b> days to inauguration · <b>${d.ops.days_to_budget}</b> to budget</div>`;
  $('#rolesel').addEventListener('change', e => { ROLE = e.target.value; localStorage.setItem('chapter.role', ROLE); if (!can(pageId)) location.href = PAGES.find(p => can(p.id)).href; else location.reload(); });
  document.title = title + ' · Chapter';
  bindAsk();
  if (!can(pageId)) { $('#page').innerHTML = `<div class="banner red">This module is not available to the ${ROLES[ROLE].label} role. Switch roles at top right or return to <a href="index.html">Operations</a>.</div>`; return false; }
  return true;
}

/* ---------- Ask: one index across every module ---------- */
let IDX = null;
function buildIndex() {
  if (IDX) return IDX; const d = DATA, ix = [];
  d.watch.watch.forEach(w => ix.push({ g: 'Executive orders', t: `EO ${w.id} · ${w.title}`, m: `${dLong(w.date)} · ${w.cat} · ${w.severity} priority`, h: `watch.html#eo=${encodeURIComponent(w.id)}`, k: (w.id + ' ' + w.title + ' ' + w.cat).toLowerCase() }));
  d.watch.press.forEach(p => ix.push({ g: 'Governor’s announcements', t: p.title, m: `${dLong(p.date)} · ${p.cat}`, h: p.href, k: (p.title + ' ' + p.cat).toLowerCase(), ext: true }));
  d.inventory.boards.forEach(b => { ix.push({ g: 'Boards & commissions', t: b.board, m: `${b.appointments} appointments since 2019 · ${b.fresh24} seats filled in the last 24 months · last ${dLong(b.last)}`, h: `inventory.html#board=${encodeURIComponent(b.board)}`, k: b.board.toLowerCase() }); b.recent.forEach(n => ix.push({ g: 'Appointees', t: n.name, m: `${b.board} · ${n.re ? 'reappointed' : 'appointed'} ${dLong(n.date)}`, h: `inventory.html#board=${encodeURIComponent(b.board)}`, k: (n.name + ' ' + (n.bio || '')).toLowerCase() })); });
  d.inventory.leaders.forEach(l => ix.push({ g: 'Agency leadership', t: `${l.title}, ${l.agency}`, m: `${l.holder} · ${l.priority}`, h: 'inventory.html#leaders', k: (l.agency + ' ' + l.title + ' ' + l.holder).toLowerCase() }));
  const tr = d.transition; [tr.coo, ...tr.cochairs].forEach(p => ix.push({ g: 'Georgia’s Promise', t: p.name, m: p.bio, h: 'appointments.html#team', k: (p.name + ' ' + p.bio).toLowerCase() }));
  tr.honorary.forEach(h => ix.push({ g: 'Georgia’s Promise · honorary', t: h, m: 'Honorary co-chair', h: 'appointments.html#team', k: h.toLowerCase() }));
  const b = d.budget; [['FY2027 state funds', fmtB(b.fy27_state_funds)], ['AFY2026 state funds', fmtB(b.afy26_state_funds)], ['Revenue Shortfall Reserve (FY2025)', fmtB(b.rsr_fy25)], ['Undesignated surplus carried into AFY2026', fmtB(b.undesignated_surplus_afy26)], ['Motor fuel funds FY2027', fmtB(b.motor_fuel_fy27)], ['Lottery funds FY2027', fmtB(b.lottery_fy27)], ['Fuel-tax suspension', `through ${dLong(b.fuel.through)}`], ['FY2027 revenue year to date', `$${b.ytd.net}B, +${b.ytd.chg}%`]].forEach(([t, m]) => ix.push({ g: 'Budget', t, m, h: 'budget.html', k: (t + ' ' + m).toLowerCase() }));
  b.calendar.forEach(c => ix.push({ g: 'Calendar', t: c.what, m: dLong(c.date), h: 'budget.html#calendar', k: (c.what + ' ' + c.date).toLowerCase() }));
  [['Who should I call about a judge Kemp just appointed?', 'watch.html'], ['Which boards have the most seats the new governor cannot touch?', 'inventory.html'], ['When is the budget due?', 'budget.html#calendar'], ['Who is on the transition team?', 'appointments.html#team'], ['How do outside firms get tasked?', 'advisors.html'], ['How do I send Chapter a document?', 'intake.html'], ['What is live data and what is not?', 'guide.html#data']].forEach(([t, h]) => ix.push({ g: 'Guide', t, m: 'Open', h, k: t.toLowerCase() }));
  IDX = ix; return ix;
}
function bindAsk() {
  const q = $('#askq'), res = $('#askres'); if (!q) return;
  const run = () => { const v = q.value.trim().toLowerCase(); if (v.length < 2) { res.classList.remove('on'); return; } const toks = v.split(/\s+/); const hits = buildIndex().filter(x => toks.every(t => x.k.includes(t))).slice(0, 40); const groups = {}; hits.forEach(h => (groups[h.g] = groups[h.g] || []).push(h)); res.innerHTML = hits.length ? Object.entries(groups).map(([g, hs]) => `<div class="grp">${g} · ${hs.length}</div>${hs.slice(0, 8).map(h => `<a href="${h.h}" ${h.ext ? 'target="_blank" rel="noopener"' : ''}>${esc(h.t)}<span class="m">${esc(h.m)}</span></a>`).join('')}`).join('') : `<div class="none">Nothing in Chapter’s data matches “${esc(q.value)}”. Try a surname, a board, an order number like 09.03.26.01, or a budget term.</div>`; res.classList.add('on'); };
  q.addEventListener('input', run); q.addEventListener('focus', run);
  document.addEventListener('click', e => { if (!e.target.closest('.ask')) res.classList.remove('on'); });
  q.addEventListener('keydown', e => { if (e.key === 'Escape') { res.classList.remove('on'); q.blur(); } if (e.key === 'Enter') { const a = res.querySelector('a'); if (a) location.href = a.href; } });
}
const sevPill = s => `<span class="pill ${s}">${s === 'high' ? 'High' : s === 'med' ? 'Medium' : 'Low'}</span>`;
function csv(rows, head, name) { const qv = v => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }; const out = [head.join(',')]; rows.forEach(r => out.push(r.map(qv).join(','))); const blob = new Blob([out.join('\n')], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); toast(`Downloaded ${rows.length} rows`); }
function initials(n) { return n.replace(/[“”"(),.]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase(); }
