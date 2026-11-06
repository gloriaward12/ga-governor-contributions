// Downloads the statewide PeachFile bulk files (contributions + expenditures) and keeps only the governor committees and the Project Battleground Georgia leadership committee.
// usage: node scripts/fetch_bulk.mjs <out_dir> [filingYears=2025,2026]
import fs from 'node:fs';
const OUT = process.argv[2] || 'data-raw';
const YEARS = (process.argv[3] || '2025,2026').split(',');
const IDS = new Set([100663,103524,101091,102576,100035,101067,101117,100753,100008,103570,100009,103725,104073,102484,102218,103705,105433]);  // 105433 = Project Battleground Georgia (leadership committee)
fs.mkdirSync(OUT, { recursive: true });
async function pull(code, file) {
  let header = null; const rows = [];
  for (const y of YEARS) {
    console.log('downloading', code, 'filing year', y);
    const r = await fetch('https://api-peachfile.ethics.ga.gov/api/ExportPublicData/GetExportPublicDownloadData', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*' },
      body: JSON.stringify({ transactionTypeCode: code, type: 'CSV', filingYear: String(y), openInNewTab: false }) });
    if (!r.ok) throw new Error('bulk download failed: HTTP ' + r.status);
    const text = Buffer.from(await r.arrayBuffer()).toString('latin1');
    const lines = text.split('\n');
    if (!header) header = lines[0].replace(/\r$/, '') + ',filing_year';
    for (const l of lines.slice(1)) { const id = +l.slice(0, l.indexOf(',')); if (IDS.has(id)) rows.push(l.replace(/\r$/, '') + ',' + y); }
    console.log('  kept', rows.length, 'rows so far');
  }
  fs.writeFileSync(`${OUT}/${file}`, header + '\n' + rows.join('\n') + '\n');
  console.log('wrote', `${OUT}/${file}`, rows.length, 'rows');
}
await pull('TCON', 'governor_field_contributions.csv');
await pull('TEXP', 'governor_field_expenditures.csv');
