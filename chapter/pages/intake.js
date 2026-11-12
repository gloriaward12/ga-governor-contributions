/* Intake: one front door. In v1 the classifier runs in the browser on pasted text; files and email routing arrive with the backend. */
function classify(text) {
  const t = text.toLowerCase(); const hits = [];
  const add = (mod, why, w) => hits.push({ mod, why, w });
  if (/résumé|resume|curriculum vitae|linkedin|experience\n|education\n|skills/.test(t)) add('Appointments · candidate pipeline', 'reads as a résumé or profile', 3);
  if (/executive order|hereby order|ordered and directed|whereas/.test(t)) add('Predecessor watch', 'executive-order language', 3);
  if (/appropriat|fiscal year|revenue estimate|state funds|opb|budget/.test(t)) add('Budget sprint', 'budget vocabulary', 2);
  if (/board of|commission|authority|reappoint|appoint/.test(t)) add('Inventory · boards', 'board or appointment language', 2);
  if (/interview|told us|said that|would stay|red flag/.test(t)) add('Personnel intel (sensitive)', 'interview capture language', 3);
  if (/deliverable|statement of work|invoice|hours|engagement/.test(t)) add('Advisors · deliverable', 'consultant deliverable language', 2);
  if (/contribut|donor|fundrais|peachfile|ngp/.test(t)) add('Governor Pulse · screens', 'campaign-finance vocabulary', 2);
  hits.sort((a, b) => b.w - a.w); return hits.length ? hits : [{ mod: 'General counsel review', why: 'no module signature matched', w: 0 }];
}
function extract(text) {
  const out = {};
  const dates = text.match(/\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2},? \d{4})\b/g) || [];
  const money = text.match(/\$\s?\d[\d,]*(?:\.\d+)?\s?(?:billion|million|B|M)?/gi) || [];
  const names = text.match(/\b[A-Z][a-z]+(?: [A-Z]\.)? [A-Z][a-z]+(?: (?:Jr|Sr|II|III))?\b/g) || [];
  const eos = text.match(/\b\d\d\.\d\d\.\d\d\.\d\d\b/g) || [];
  out.dates = [...new Set(dates)].slice(0, 8); out.money = [...new Set(money)].slice(0, 8); out.names = [...new Set(names)].filter(n => !/^(The|This|That|State|Governor|Office|Board|Fiscal|Executive) /.test(n)).slice(0, 12); out.orders = [...new Set(eos)];
  return out;
}
function render() {
  $('#page').innerHTML = `
  <div class="ph"><div><h1>Intake</h1><div class="sub">One front door for every document. Paste text or drop a file; Chapter reads it, works out what it is, pulls out the fields that matter, checks it against what it already knows and proposes where it belongs. Nothing is filed until a person confirms, and every submission is logged for General Counsel.</div></div></div>
  <div class="grid g12">
    <div class="card"><div class="hd"><h2>Ways in</h2></div><div class="bd small" style="line-height:1.7">
      <div><b>This screen.</b> Paste or drop; files are read in the browser.</div>
      <div><b>Email.</b> A dedicated intake address per engagement; sender determines where it may file. <span class="mute">(activates with the backend)</span></div>
      <div><b>Firm upload links.</b> Private, expiring links that accept only deliverables and invoices for that engagement.</div>
      <div><b>Forms.</b> Candidate referrals, interview capture, “flag this” tips.</div>
      <div><b>Automatic feeds.</b> Executive orders, press releases, DOR revenue, board appointments, Commission filings: pulled nightly, no upload needed.</div>
      <h3 style="margin-top:12px">Rules</h3>
      <div>Human confirmation before anything changes a module.</div><div>Résumés, interview notes and vetting default to Sensitive: Chief of Staff, Personnel Director, General Counsel.</div><div>Every submission writes an audit entry: who, when, what type, where it went. Not the content.</div><div>Firms see only their own engagement.</div><div>Exports are watermarked and logged.</div></div></div>
    <div class="card"><div class="hd"><h2>Analyze a document</h2><span class="src">Runs locally in your browser; nothing is sent anywhere in v1</span></div><div class="bd">
      <div class="field"><label>What are you adding?</label><select id="kind"><option>Let Chapter decide</option><option>Résumé / candidate referral</option><option>Executive order or legal document</option><option>Budget material</option><option>Interview notes (sensitive)</option><option>Consultant deliverable</option></select></div>
      <div class="drop" id="drop">Drop a .txt, .md or .csv here, or paste below. PDF and Word reading arrives with the backend.</div>
      <div class="field" style="margin-top:12px"><label>Or paste text</label><textarea id="txt" placeholder="Paste the document text…"></textarea></div>
      <div style="display:flex;gap:8px"><button class="btn primary" id="go">Analyze</button><button class="btn" id="clr">Clear</button><button class="btn" id="sample">Try a sample</button></div>
      <div id="out" style="margin-top:16px"></div></div></div>
  </div>
  <div class="card" style="margin-top:16px" id="referral"><div class="hd"><h2>Refer a candidate</h2><span class="src">Sensitive · Chief of Staff, Personnel Director</span></div><div class="bd">
    <div class="grid g3"><div class="field"><label>Candidate</label><input id="rc"></div><div class="field"><label>For seat</label><input id="rs" placeholder="e.g. Executive Director, OPB"></div><div class="field"><label>Referred by</label><input id="rb"></div></div>
    <div class="field"><label>Why</label><textarea id="rw" style="min-height:70px"></textarea></div><button class="btn primary" id="rgo">Queue for review</button>
    <div class="note" style="margin-top:8px">v1 stores referrals on this device only; the backend adds the shared, audited register.</div></div></div>
  <div class="card" style="margin-top:16px"><div class="hd"><h2>Review queue (this device)</h2><button class="btn sm" id="wipe">Clear</button></div><div class="bd" id="queue"></div></div>`;
  const Q = JSON.parse(localStorage.getItem('chapter.queue') || '[]');
  const drawQ = () => { $('#queue').innerHTML = Q.length ? `<table><thead><tr><th>When</th><th>Type</th><th>Proposed module</th><th>Summary</th><th>Status</th></tr></thead><tbody>${Q.slice().reverse().map(x => `<tr><td class="mono small nowrap">${x.when}</td><td>${esc(x.kind)}</td><td>${esc(x.mod)}</td><td class="small">${esc(x.sum)}</td><td><span class="pill amber">Awaiting confirmation</span></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nothing queued.</div>'; };
  drawQ();
  const save = () => localStorage.setItem('chapter.queue', JSON.stringify(Q));
  const analyze = text => { if (!text.trim()) { toast('Paste something first'); return; } const cls = classify(text), ex = extract(text); const known = DATA.watch.watch.filter(w => ex.orders.includes(w.id)); const boardsHit = DATA.inventory.boards.filter(b => text.toLowerCase().includes(b.board.toLowerCase())).slice(0, 5);
    $('#out').innerHTML = `<h3>Proposed filing</h3><table><tbody>${cls.slice(0, 3).map((c, i) => `<tr><td>${i === 0 ? '<b>' + esc(c.mod) + '</b>' : esc(c.mod)}</td><td class="small mute">${esc(c.why)}</td><td>${i === 0 ? '<span class="pill blue">Recommended</span>' : ''}</td></tr>`).join('')}</tbody></table>
      <h3 style="margin-top:12px">Extracted</h3><dl class="kv"><dt>Names</dt><dd style="font-weight:400">${ex.names.join(' · ') || '—'}</dd><dt>Dates</dt><dd style="font-weight:400">${ex.dates.join(' · ') || '—'}</dd><dt>Amounts</dt><dd style="font-weight:400">${ex.money.join(' · ') || '—'}</dd><dt>Order numbers</dt><dd style="font-weight:400">${ex.orders.join(' · ') || '—'}</dd></dl>
      <h3 style="margin-top:12px">Checked against Chapter</h3><div class="small">${known.length ? known.map(w => `Order ${w.id} is already on file: ${esc(w.title)} (${dLong(w.date)}).`).join('<br>') : 'No order numbers in this document are on file.'}${boardsHit.length ? '<br>Boards mentioned that Chapter tracks: ' + boardsHit.map(b => `<a href="inventory.html#board=${encodeURIComponent(b.board)}">${esc(b.board)}</a>`).join(', ') : ''}</div>
      <div style="margin-top:12px;display:flex;gap:8px"><button class="btn primary" id="confirm">Confirm and queue</button><span class="small mute">Sensitivity: ${/interview|résumé|resume/i.test(text) ? '<span class="pill red">Sensitive</span>' : '<span class="pill">Standard</span>'}</span></div>`;
    $('#confirm').addEventListener('click', () => { Q.push({ when: new Date().toLocaleString(), kind: $('#kind').value, mod: cls[0].mod, sum: text.slice(0, 120).replace(/\s+/g, ' ') + '…' }); save(); drawQ(); toast('Queued for confirmation'); }); };
  $('#go').addEventListener('click', () => analyze($('#txt').value)); $('#clr').addEventListener('click', () => { $('#txt').value = ''; $('#out').innerHTML = ''; });
  $('#sample').addEventListener('click', () => { $('#txt').value = 'Executive Order 09.03.26.01. WHEREAS, a vacancy exists in the District 5 seat of the Georgia Public Service Commission; NOW, THEREFORE, I, Brian P. Kemp, Governor, hereby appoint Stancil C. Wise Jr. to serve the remainder of the term expiring December 31, 2026.'; analyze($('#txt').value); });
  const drop = $('#drop'); drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = 'var(--action)'; }); drop.addEventListener('dragleave', () => drop.style.borderColor = ''); drop.addEventListener('drop', e => { e.preventDefault(); drop.style.borderColor = ''; const f = e.dataTransfer.files[0]; if (!f) return; if (!/\.(txt|md|csv)$/i.test(f.name)) { toast('v1 reads .txt, .md, .csv'); return; } f.text().then(t => { $('#txt').value = t; analyze(t); }); });
  $('#rgo').addEventListener('click', () => { const c = $('#rc').value.trim(); if (!c) { toast('Name the candidate'); return; } Q.push({ when: new Date().toLocaleString(), kind: 'Referral (sensitive)', mod: 'Appointments · candidate pipeline', sum: `${c} for ${$('#rs').value || '—'}, referred by ${$('#rb').value || '—'}` }); save(); drawQ(); ['rc', 'rs', 'rb', 'rw'].forEach(i => $('#' + i).value = ''); toast('Referral queued'); });
  $('#wipe').addEventListener('click', () => { Q.length = 0; save(); drawQ(); });
}
