// Pulls the Commission's candidate registry for Governor (totals raised/spent and cash on hand as the Commission computes them).
// usage: node scripts/registry.mjs <out_json>
import fs from 'node:fs';
const OUT = process.argv[2] || 'data-raw/registry.json';
const body = { pageNumber: 1, pageSize: 100, filerTypeCode: 'RC', filerName: null, politicalPartyCode: null, OfficeSought: 17, totalRaisedMax: null, totalRaisedMin: null, totalSpentMax: null, totalSpentMin: null, balanceFundsMax: null, balanceFundsMin: null, accountStatus: null, election: null, electionCycle: null, transactionSourceTypeCode: null, treasurerName: null, jurisdictionId: null, campaignName: null, cityDistrictId: null, districtTypeId: null, jurisdictionIsStateOrIsCounty: null, districtTypeDesc: null };
const r = await fetch('https://api-peachfile.ethics.ga.gov/api/PublicFilerDetails/GetCandidateDetails', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*' }, body: JSON.stringify(body) });
if (!r.ok) throw new Error('registry failed: HTTP ' + r.status);
const j = await r.json();
const items = (j.data && j.data.items || []).filter(i => /2026/.test(i.electionCycleName || '')).map(i => ({ id: i.filerEntityId, committee: i.committeeName, filer: i.filerName, party: i.politicalPartyCode, status: i.filerStatus, raised: i.totalContributions, spent: i.totalExpenditures, cashOnHand: i.cashOnHand, cycle: i.electionCycleName, first: i.candidateFirstName, last: i.candidateLastName }));
fs.mkdirSync(OUT.split('/').slice(0, -1).join('/') || '.', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ pulledAt: new Date().toISOString(), candidates: items }, null, 1));
console.log('wrote', OUT, items.length, 'registry rows');
