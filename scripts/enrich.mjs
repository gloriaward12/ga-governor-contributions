// Pulls occupation / employer (and any filings newer than the bulk extract) from the PeachFile public search API.
// usage: node scripts/enrich.mjs <out_json_gz>
import fs from 'node:fs'; import zlib from 'node:zlib';
const OUT = process.argv[2] || 'data-raw/api_enrichment.json.gz';
const FILERS = ['Keisha for Governor','Jackson for Governor, Inc.','Burt Jones for Georgia','Brad for Governor, Inc.','Carr for Georgia, Inc.','Georgia for Jason, Inc.','Duncan for Georgia','Mike Thurmond For Governor','Committee to Elect Derrick Jackson','Clark Dean for Governor','Friends of Ruwa','Olu Brown for Governor, Inc.','Chase Oliver for Governor','Yasger, Kenneth','Gregg Kirkpatrick for Governor','Pacetti, Andrew'];
const CONCURRENCY = +(process.env.ENRICH_CONCURRENCY || 4);
const items = new Map();
async function page(filer, stc, pn, st) {
  const body = { pageNumber: pn, pageSize: 100, sortBy: 'Transaction Date', sortType: st, transactionTypeCode: 'TCON', filerName: filer, sourceName: '', transactionAmountMax: null, sourceTypeCode: stc, committeeType: '', electionID: '', reportName: '', toDate: null, fromDate: null, byState: '', electionType: '', electionYear: '', filerRegistrationGuid: null };
  let last;
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch('https://api-peachfile.ethics.ga.gov/api/PublicTransactionDetails/GetTransactionDetails', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*' }, body: JSON.stringify(body) });
      if (r.ok) { const j = await r.json(); if (j && j.data && j.data.items) return j.data; last = 'bad body'; }
      else last = 'HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120);
    } catch (e) { last = String(e); }
    await new Promise(s => setTimeout(s, 2000 * (t + 1)));
  }
  throw new Error(`API failed for ${filer} ${stc} ${st} page ${pn}: ${last}`);
}
const pick = i => ({ id: i.transactionId, g: i.guid, fid: i.filerEntityId, filer: i.filerName, n: i.sourceName, a: i.transactionAmount, d: i.transactionDate, sub: i.transactionSubTypeDesc, tt: i.transactionTypeCodeDescription, st: i.transactionStatusCode, et: i.electionTypeDescription, src: i.transactionSource, fn: i.payeeFirstName, ln: i.payeeLastName, mn: i.payeeMiddleName, a1: i.transactionSourceAddressLine1, city: i.transactionSourceCity, state: i.transactionSourceStateCode, zip: i.transactionSourceZipcode, occ: i.payeeOccupation, emp: i.payeeEmployer, rep: i.reportName, timed: i.timedReport });
// the API's date sort is not stable across pages, so each (filer, source type) is paged in both directions and the results unioned
const tasks = [];
for (const f of FILERS) for (const stc of ['TIND', 'TBSN', 'TNCC']) for (const st of ['desc', 'asc']) tasks.push({ f, stc, st });
let next = 0, done = 0;
async function worker() {
  while (next < tasks.length) {
    const { f, stc, st } = tasks[next++];
    let pn = 1, total = 0;
    while (true) {
      const d = await page(f, stc, pn, st); total = d.totalItems;
      for (const it of d.items) items.set(it.guid, pick(it));
      if (d.items.length < 100 || pn * 100 >= d.totalItems) break;
      pn++;
    }
    done++; console.log(`[${done}/${tasks.length}] ${f} ${stc} ${st}: ${total} rows (${items.size} unique so far)`);
  }
}
const t0 = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
fs.mkdirSync(OUT.split('/').slice(0, -1).join('/') || '.', { recursive: true });
fs.writeFileSync(OUT, zlib.gzipSync(JSON.stringify([...items.values()])));
console.log('wrote', OUT, items.size, 'records in', Math.round((Date.now() - t0) / 1000), 's');
