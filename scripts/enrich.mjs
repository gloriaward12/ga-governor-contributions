// Pulls occupation / employer (and any filings newer than the bulk extract) from the PeachFile public search API.
// usage: node scripts/enrich.mjs <out_json_gz>
import fs from 'node:fs'; import zlib from 'node:zlib';
const OUT = process.argv[2] || 'data-raw/api_enrichment.json.gz';
const FILERS = ['Keisha for Governor','Jackson for Governor, Inc.','Burt Jones for Georgia','Brad for Governor, Inc.','Carr for Georgia, Inc.','Georgia for Jason, Inc.','Duncan for Georgia','Mike Thurmond For Governor','Committee to Elect Derrick Jackson','Clark Dean for Governor','Friends of Ruwa','Olu Brown for Governor, Inc.','Chase Oliver for Governor','Yasger, Kenneth','Gregg Kirkpatrick for Governor','Pacetti, Andrew'];
const items = new Map();
async function page(filer, stc, pn, st, extra = {}) {
  const body = { pageNumber: pn, pageSize: 100, sortBy: 'Transaction Date', sortType: st, transactionTypeCode: 'TCON', filerName: filer, sourceName: '', transactionAmountMax: null, sourceTypeCode: stc, committeeType: '', electionID: '', reportName: '', toDate: null, fromDate: null, byState: '', electionType: '', electionYear: '', filerRegistrationGuid: null, ...extra };
  for (let t = 0; t < 4; t++) {
    const r = await fetch('https://api-peachfile.ethics.ga.gov/api/PublicTransactionDetails/GetTransactionDetails', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*' }, body: JSON.stringify(body) });
    if (r.ok) return (await r.json()).data;
    await new Promise(s => setTimeout(s, 1500 * (t + 1)));
  }
  throw new Error('API failed for ' + filer + ' page ' + pn);
}
const pick = i => ({ id: i.transactionId, g: i.guid, fid: i.filerEntityId, filer: i.filerName, n: i.sourceName, a: i.transactionAmount, d: i.transactionDate, sub: i.transactionSubTypeDesc, tt: i.transactionTypeCodeDescription, st: i.transactionStatusCode, et: i.electionTypeDescription, src: i.transactionSource, fn: i.payeeFirstName, ln: i.payeeLastName, mn: i.payeeMiddleName, a1: i.transactionSourceAddressLine1, city: i.transactionSourceCity, state: i.transactionSourceStateCode, zip: i.transactionSourceZipcode, occ: i.payeeOccupation, emp: i.payeeEmployer, rep: i.reportName, timed: i.timedReport });
for (const f of FILERS) for (const stc of ['TIND', 'TBSN', 'TNCC']) for (const st of ['desc', 'asc']) {
  // the API's date sort is not stable across pages, so we page in both directions and union the results
  let pn = 1;
  while (true) { const d = await page(f, stc, pn, st); for (const it of d.items) items.set(it.guid, pick(it)); if (d.items.length < 100 || pn * 100 >= d.totalItems) break; pn++; }
  console.log(f, stc, st, 'total so far', items.size);
}
fs.writeFileSync(OUT, zlib.gzipSync(JSON.stringify([...items.values()])));
console.log('wrote', OUT, items.size, 'records');
