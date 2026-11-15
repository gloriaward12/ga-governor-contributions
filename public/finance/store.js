/* Finance working records: segments, watch list, donor actions, saved views. Kept in this browser and mirrored to the project's
   private Blob store when one is connected (api/private/store). The fundraiser's name ("working as") travels with every change. */
const GPS = { keys: ['actions', 'watch', 'segments', 'users'], etags: {}, synced: false, store: false };
const gpRec = (k, d) => { try { return JSON.parse(localStorage.getItem('gp.' + k) || 'null') ?? d; } catch (e) { return d; } };
const gpSet = (k, v) => { localStorage.setItem('gp.' + k, JSON.stringify(v)); gpQueue(k, v); };
const gpUser = () => localStorage.getItem('gp.me') || '';
function gpSetUser(n) { localStorage.setItem('gp.me', n); const u = gpRec('users', []); if (n && !u.includes(n)) { u.push(n); gpSet('users', u); } }
const PUTQ = {}; function gpQueue(k, v) { if (!GPS.synced) return; clearTimeout(PUTQ[k]); PUTQ[k] = setTimeout(() => gpPush(k, v), 400); }
async function gpPush(k, v) { try { const r = await fetch('/api/private/store?k=' + k, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-gp-user': gpUser() }, body: JSON.stringify({ value: v, etag: GPS.etags[k] || null }) }); const j = await r.json().catch(() => ({})); if (r.status === 409 && j.current) { localStorage.setItem('gp.' + k, JSON.stringify(j.current.value)); GPS.etags[k] = j.current.etag; toast('Someone else changed this; reloading their version'); setTimeout(() => location.reload(), 1000); return; } if (r.ok) GPS.etags[k] = j.etag || null; } catch (e) {} }
async function gpSync() { try { const r = await fetch('/api/private/store?all=1', { cache: 'no-store' }); if (!r.ok) return; const j = await r.json(); GPS.store = true; Object.entries(j.records || {}).forEach(([k, v]) => { GPS.etags[k] = v.etag; if (v.value != null) localStorage.setItem('gp.' + k, JSON.stringify(v.value)); }); GPS.synced = true; } catch (e) {} }
/* donor actions */
const ACT_STATUS = ['open', 'contacted', 'pledged', 'closed', 'skipped'];
function actions() { return gpRec('actions', []); }
function actionFor(key) { return actions().find(a => a.key === key && !['closed', 'skipped'].includes(a.status)); }
function actionCreate(r, o) { const A = actions(); const now = new Date().toISOString(); const a = Object.assign({ id: 'a-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), key: r.k, name: r.name, city: r.city, emp: r.emp || '', given: r.total, last: r.last, headroom: r.headroom ?? null, segment: '', owner: '', status: 'open', next: '', ask: r.ask || 0, notes: '', lastContact: null, created: now, updated: now, history: [{ ts: now, who: gpUser() || 'unknown', change: 'created' + (o && o.owner ? ' · assigned to ' + o.owner : '') }] }, o || {}); A.push(a); gpSet('actions', A); return a; }
function actionUpdate(id, patch, note) { const A = actions(); const a = A.find(x => x.id === id); if (!a) return; const ch = Object.entries(patch).filter(([k, v]) => a[k] !== v).map(([k, v]) => `${k}: ${a[k] || '—'} → ${v || '—'}`); Object.assign(a, patch); a.updated = new Date().toISOString(); if (patch.status === 'contacted') a.lastContact = a.updated; if (ch.length || note) a.history.push({ ts: a.updated, who: gpUser() || 'unknown', change: [note, ...ch].filter(Boolean).join('; ') }); gpSet('actions', A); }
/* watch list */
function watched() { return gpRec('watch', []); }
function watchToggle(r) { const W = watched(); const i = W.findIndex(w => w.key === r.k); if (i >= 0) W.splice(i, 1); else W.push({ key: r.k, name: r.name, city: r.city, by: gpUser(), ts: new Date().toISOString(), last: r.last, total: r.total }); gpSet('watch', W); return i < 0; }
/* saved segments / views */
function segments() { return gpRec('segments', []); }
function segmentSave(s) { const S = segments(); S.push(Object.assign({ id: 's-' + Date.now().toString(36), by: gpUser(), shared: true, ts: new Date().toISOString() }, s)); gpSet('segments', S); }
function segmentDelete(id) { gpSet('segments', segments().filter(s => s.id !== id)); }
/* who am I chip (rendered into a host element) */
function userChip(host) { const u = gpUser(); const list = gpRec('users', []); host.innerHTML = `<span class="small muted">Working as</span> <select id="gp-me" class="btn" style="padding:4px 10px">${['', ...list].map(n => `<option ${n === u ? 'selected' : ''}>${n || '— pick or add —'}</option>`).join('')}<option value="__new">+ add name</option></select><span class="small muted" style="margin-left:8px">${GPS.synced ? '● shared with the team' : '○ this browser only'}</span>`; host.querySelector('#gp-me').addEventListener('change', e => { let v = e.target.value; if (v === '__new') { v = (prompt('Your name as it should appear on actions') || '').trim(); } gpSetUser(v); userChip(host); if (typeof render === 'function') render(); }); }
function csvQ(v) { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function dlText(name, text, type = 'text/csv') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); }
