"""Build per-candidate data files + a field summary for the Georgia governor's race.
usage: prep_field.py <field_csv> <out_dir> [enrichment json.gz ...]
"""
import pandas as pd, json, re, gzip, datetime as dt, sys, os, collections

SRC, OUT = sys.argv[1], sys.argv[2]
ENRICH = sys.argv[3:]
os.makedirs(OUT, exist_ok=True)
EPOCH = dt.date(2025, 1, 1)
CANDS = {  # entity id -> meta (from PeachFile candidate registry, 2026 Georgia State Election, office = Governor)
    100663: dict(cand='Keisha Lance Bottoms', short='Bottoms', party='DEM'),
    103524: dict(cand='Rick Jackson', short='R. Jackson', party='REP'),
    101091: dict(cand='Burt Jones', short='B. Jones', party='REP'),
    102576: dict(cand='Brad Raffensperger', short='Raffensperger', party='REP'),
    100035: dict(cand='Chris Carr', short='Carr', party='REP'),
    101067: dict(cand='Jason Esteves', short='Esteves', party='DEM'),
    101117: dict(cand='Geoff Duncan', short='Duncan', party='DEM'),
    100753: dict(cand='Michael Thurmond', short='Thurmond', party='DEM'),
    100008: dict(cand='Derrick Jackson', short='D. Jackson', party='DEM'),
    103570: dict(cand='Clark Dean', short='Dean', party='REP'),
    100009: dict(cand='Ruwa Romman', short='Romman', party='DEM'),
    103725: dict(cand='Olu Brown', short='Brown', party='DEM'),
    104073: dict(cand='Chase Oliver', short='Oliver', party='LIB'),
    102484: dict(cand='Kenneth Yasger', short='Yasger', party='REP'),
    102218: dict(cand='Gregg Kirkpatrick', short='Kirkpatrick', party='REP'),
    103705: dict(cand='Andrew Pacetti', short='Pacetti', party='OTH'),
}

def days(s):
    m, d, y = s.split('/'); return (dt.date(int(y), int(m), int(d)) - EPOCH).days
def clean(s): return re.sub(r'\s+', ' ', str(s)).strip()
def norm(s): return re.sub(r'[^a-z0-9]', '', s.lower())

df = pd.read_csv(SRC, dtype=str, keep_default_na=False)
df['Filing Entity ID'] = df['Filing Entity ID'].astype(int)
df = df[df['Filing Entity ID'].isin(CANDS)].copy()
df['amt'] = (df['Transaction Amount'].str.replace(r'[\$,]', '', regex=True).str.replace(r'^\((.*)\)$', r'-\1', regex=True).astype(float))
df['zip5'] = df['Contributor Address Zip Code'].str.replace(r'^="?|"?$', '', regex=True).str.strip().str[:5]
df['day'] = df['Transaction Date'].map(days)
df['repday'] = df['Report Filed Date'].map(lambda s: days(s) if s else -1)
TXT = ['Contributor Last Name', 'Contributor First Name', 'Contributor Middle Name', 'Contributor Address City', 'Contributor Address State',
       'Contributor/Person Responsible for Loan Occupation', 'Contributor/Person Responsible for Loan Employer', 'Contributor Address Line 1',
       'Transaction Description', 'Disclosure Report Name', 'Timed Report Name']
for c in TXT: df[c] = df[c].map(clean)

# ---- enrichment from the live API (occupation / employer, plus rows filed after the bulk extract)
api = []
for f in ENRICH: api += json.load(gzip.open(f))
occ_by = {a['id']: clean(a.get('occ') or '') for a in api}
emp_by = {a['id']: clean(a.get('emp') or '') for a in api}
tid = df['Transaction Id'].astype(int)
df['Contributor/Person Responsible for Loan Occupation'] = [occ_by.get(t) or o for t, o in zip(tid, df['Contributor/Person Responsible for Loan Occupation'])]
df['Contributor/Person Responsible for Loan Employer'] = [emp_by.get(t) or e for t, e in zip(tid, df['Contributor/Person Responsible for Loan Employer'])]
have = set(tid)
name_to_id = {clean(n): i for i, n in zip(df['Filing Entity ID'], df['Filing Entity Name'])}
new_rows = []
for a in api:
    if a['id'] in have: continue
    fid = a.get('fid') or name_to_id.get(clean(a.get('filer') or '')) or (100663 if 'fid' not in a and 'filer' not in a else None)
    if fid not in CANDS: continue
    # only add rows the bulk extract could not have had yet: recent Two-Business-Day filings
    if not a.get('timed') or days(a['d']) < days('10/01/2026'): continue
    amt = float(a['a']) * (-1 if a['tt'] == 'Return Contribution' else 1)
    new_rows.append({'Filing Entity ID': fid, 'Filing Entity Name': a.get('filer') or '', 'Transaction Id': str(a['id']), 'Transaction Type': a['tt'],
        'Transaction Sub Type': 'In-Kind Contribution' if 'In-Kind' in a['sub'] else 'Itemized Contribution',
        'Contributor Type': a['src'], 'Contributor Last Name': clean(a.get('ln') or a.get('n') or ''), 'Contributor First Name': clean(a.get('fn') or ''),
        'Contributor Middle Name': clean(a.get('mn') or ''), 'Contributor Address Line 1': clean(a.get('a1') or ''), 'Contributor Address City': clean(a.get('city') or ''),
        'Contributor Address State': clean(a.get('state') or ''), 'zip5': (a.get('zip') or '')[:5],
        'Contributor/Person Responsible for Loan Occupation': clean(a.get('occ') or ''), 'Contributor/Person Responsible for Loan Employer': clean(a.get('emp') or ''),
        'Transaction Date': a['d'], 'amt': amt, 'day': days(a['d']), 'repday': -1, 'Election Type': (a.get('et') or '').split('-')[0], 'Election Year': '2026',
        'Transaction Description': '', 'Amended': 'N', 'Timed Report Name': a.get('timed') or '', 'Disclosure Report Name': a.get('rep') or ''})
if new_rows:
    nr = pd.DataFrame(new_rows)
    for c in df.columns:
        if c not in nr.columns: nr[c] = ''
    df = pd.concat([df, nr[df.columns]], ignore_index=True)
added = collections.Counter(r['Filing Entity ID'] for r in new_rows)
df['cents'] = (df['amt'] * 100).round().astype(int)
df['name'] = [f"{l}, {f}{(' ' + m) if m else ''}".strip() if (f or m) else l for l, f, m in zip(df['Contributor Last Name'], df['Contributor First Name'], df['Contributor Middle Name'])]
df['dkey'] = [(norm(l) + '|' + norm(f)[:6] + '|' + z) if f else (norm(l) + '|' + z) for l, f, z in zip(df['Contributor Last Name'], df['Contributor First Name'], df['zip5'])]
df['report'] = [t if t else d for t, d in zip(df['Timed Report Name'], df['Disclosure Report Name'])]

class Dict:
    def __init__(self): self.m = {}; self.v = []
    def idx(self, s):
        if s not in self.m: self.m[s] = len(self.v); self.v.append(s)
        return self.m[s]

def build(sub):
    dicts = {k: Dict() for k in ['name', 'ctype', 'sub', 'ttype', 'etype', 'city', 'state', 'zip', 'occ', 'emp', 'report', 'addr', 'desc', 'dkey', 'eyear']}
    for d in dicts.values(): d.idx('')
    unit_mask = sub['Transaction Sub Type'].eq('Unitemized Contribution')
    det, unit = sub[~unit_mask], sub[unit_mask]
    cols = {k: [] for k in ['tid', 'day', 'cents', 'name', 'dkey', 'ctype', 'sub', 'ttype', 'etype', 'eyear', 'city', 'state', 'zip', 'occ', 'emp', 'report', 'addr', 'desc', 'amended', 'repday']}
    for r in det.to_dict('records'):
        cols['tid'].append(int(r['Transaction Id'])); cols['day'].append(int(r['day'])); cols['cents'].append(int(r['cents'])); cols['repday'].append(int(r['repday']))
        cols['name'].append(dicts['name'].idx(r['name'])); cols['dkey'].append(dicts['dkey'].idx(r['dkey']))
        cols['ctype'].append(dicts['ctype'].idx(r['Contributor Type'])); cols['sub'].append(dicts['sub'].idx(r['Transaction Sub Type'] or r['Transaction Type']))
        cols['ttype'].append(dicts['ttype'].idx(r['Transaction Type'])); cols['etype'].append(dicts['etype'].idx(r['Election Type'])); cols['eyear'].append(dicts['eyear'].idx(r['Election Year']))
        c = r['Contributor Address City']; cols['city'].append(dicts['city'].idx(c.title() if c.isupper() else c))
        cols['state'].append(dicts['state'].idx(r['Contributor Address State'].upper())); cols['zip'].append(dicts['zip'].idx(r['zip5']))
        cols['occ'].append(dicts['occ'].idx(r['Contributor/Person Responsible for Loan Occupation'])); cols['emp'].append(dicts['emp'].idx(r['Contributor/Person Responsible for Loan Employer']))
        cols['report'].append(dicts['report'].idx(r['report'])); cols['addr'].append(dicts['addr'].idx(r['Contributor Address Line 1'])); cols['desc'].append(dicts['desc'].idx(r['Transaction Description']))
        cols['amended'].append(1 if r['Amended'] == 'Y' else 0)
    ucols = {k: [] for k in ['day', 'cents', 'etype', 'ttype', 'report', 'repday']}
    for r in unit.to_dict('records'):
        ucols['day'].append(int(r['day'])); ucols['cents'].append(int(r['cents'])); ucols['repday'].append(int(r['repday']))
        ucols['etype'].append(dicts['etype'].idx(r['Election Type'])); ucols['ttype'].append(dicts['ttype'].idx(r['Transaction Type'])); ucols['report'].append(dicts['report'].idx(r['report']))
    return {k: d.v for k, d in dicts.items()}, cols, ucols, len(det), len(unit)

field = []
for fid, meta in CANDS.items():
    sub = df[df['Filing Entity ID'] == fid]
    if not len(sub): continue
    committee = sub['Filing Entity Name'].mode().iloc[0]
    dicts, cols, ucols, nd, nu = build(sub)
    con = sub[sub['Transaction Type'] == 'Contribution']; ret = sub[sub['Transaction Type'] == 'Return Contribution']
    loans = sub[sub['Transaction Type'].str.startswith('Loan')]
    # loans are listed twice in the export; collapse
    lo = loans.drop_duplicates(['Transaction Type', 'Transaction Date', 'cents', 'Transaction Description'])
    gross = con['amt'].sum(); unit = con[con['Transaction Sub Type'] == 'Unitemized Contribution']['amt'].sum()
    inkind = con[con['Transaction Sub Type'] == 'In-Kind Contribution']['amt'].sum()
    ind = con[(con['Transaction Sub Type'] != 'Unitemized Contribution')]
    ga = ind[ind['Contributor Address State'].str.upper() == 'GA']['amt'].sum(); ind_tot = ind['amt'].sum()
    self_fund = con[con['Contributor Type'].isin(['Self', 'Candidate / Candidate Committee'])]['amt'].sum()
    # candidate's own name as contributor (self-funding reported as individual)
    last = meta['cand'].split()[-1].lower()
    own = con[(con['Contributor Type'] == 'Individual') & (con['Contributor Last Name'].str.lower().str.contains(last)) & (con['Contributor First Name'].str.lower().str.startswith(meta['cand'].split()[0].lower()[:3]))]['amt'].sum()
    monthly = {}
    for d, a in zip(con['day'], con['amt']):
        t = EPOCH + dt.timedelta(days=int(d)); k = t.year * 12 + t.month - 1; monthly[k] = monthly.get(k, 0) + a
    bands = [(0, 100), (100, 1000), (1000, 8400), (8400, 1e18)]
    bandsum = [float(con[(con['amt'] >= lo_) & (con['amt'] < hi_)]['amt'].sum()) for lo_, hi_ in bands]
    bandn = [int(((con['amt'] >= lo_) & (con['amt'] < hi_)).sum()) for lo_, hi_ in bands]
    donors = ind[ind['Contributor Type'] == 'Individual']['dkey'].nunique()
    meta_out = dict(id=fid, committee=committee, **meta, rows=int(len(sub)), detailRows=nd, unitemizedRows=nu, gross=round(gross, 2), refunds=round(ret['amt'].sum(), 2),
                    net=round(gross + ret['amt'].sum(), 2), unitemized=round(unit, 2), inkind=round(inkind, 2), itemized=round(gross - unit - inkind, 2),
                    gaShare=round(ga / ind_tot, 4) if ind_tot else None, donors=int(donors), contributions=int(len(con)),
                    selfFunding=round(self_fund + own, 2), loansReceived=round(lo[lo['Transaction Type'] == 'Loan Received']['amt'].sum(), 2),
                    loansRepaid=round(lo[lo['Transaction Type'] == 'Loan Payment']['amt'].sum(), 2),
                    firstDay=int(sub['day'].min()), lastDay=int(sub['day'].max()), monthly={str(k): round(v, 2) for k, v in sorted(monthly.items())},
                    bands=dict(labels=['< $100', '$100–999', '$1,000–8,399', '$8,400+'], sums=[round(x, 2) for x in bandsum], counts=bandn),
                    apiRowsAdded=int(added.get(fid, 0)), avgGift=round(gross / len(con), 2) if len(con) else 0,
                    medianGift=float(con['amt'].median()) if len(con) else 0)
    field.append(meta_out)
    out = {'meta': dict(meta_out, filer=committee, candidate=meta['cand'], filerEntityId=fid, epoch=EPOCH.isoformat(),
                        source='Georgia Government Transparency & Campaign Finance Commission (PeachFile) bulk Contribution files, filing years 2025 + 2026',
                        extractedAsOf='11/06/2026 02:00 AM', apiPulledAt='11/06/2026 ~09:45 AM ET'),
           'dict': dicts, 'det': cols, 'unit': ucols}
    with open(os.path.join(OUT, f'cand-{fid}.json'), 'w') as f: json.dump(out, f, separators=(',', ':'))
    print(fid, committee, 'rows', len(sub), 'gross', round(gross), 'net', round(gross + ret['amt'].sum()), 'added', added.get(fid, 0), 'kb', os.path.getsize(os.path.join(OUT, f'cand-{fid}.json')) // 1024)

field.sort(key=lambda x: -x['net'])
json.dump({'generated': dt.datetime.utcnow().isoformat() + 'Z', 'extractedAsOf': '11/06/2026 02:00 AM', 'epoch': EPOCH.isoformat(), 'candidates': field},
          open(os.path.join(OUT, 'field.json'), 'w'), separators=(',', ':'))
print('field.json', len(field), 'candidates')
