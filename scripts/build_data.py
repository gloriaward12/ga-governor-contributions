"""Governor Pulse data build.
usage: build_data.py <data-raw dir> <out_dir> [enrichment json.gz ...]
Reads governor_field_contributions.csv, governor_field_expenditures.csv, registry.json from <data-raw>,
writes per-candidate cand-<id>.json, field.json and cross.json into <out_dir>.
"""
import pandas as pd, json, re, gzip, datetime as dt, sys, os, collections, math

RAW, OUT = sys.argv[1], sys.argv[2]
ENRICH = sys.argv[3:]
os.makedirs(OUT, exist_ok=True)
EPOCH = dt.date(2025, 1, 1)
import zoneinfo
NOW = dt.datetime.now(zoneinfo.ZoneInfo('America/New_York'))
_ex = NOW.replace(hour=2, minute=0, second=0, microsecond=0)
if NOW < _ex: _ex -= dt.timedelta(days=1)
EXTRACTED = os.environ.get('EXTRACTED_AS_OF') or _ex.strftime('%m/%d/%Y %I:%M %p ET')
PULLED = NOW.strftime('%m/%d/%Y %I:%M %p ET')
CANDS = {  # entity id -> meta (PeachFile candidate registry, 2026 Georgia State Election, office = Governor)
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
    # leadership committee (Non-Candidate Committee / Leadership Committee) allied with the Democratic nominee; no contribution limits apply
    105433: dict(cand='Project Battleground Georgia', short='Battleground', party='DEM', kind='leadership', ally=100663),
}
LIMITS = {'Primary': 8400, 'Primary Runoff': 4800, 'General': 8400, 'General Runoff': 4800}

def days(s):
    m, d, y = s.split('/'); return (dt.date(int(y), int(m), int(d)) - EPOCH).days
def clean(s): return re.sub(r'\s+', ' ', str(s)).strip()
def norm(s): return re.sub(r'[^a-z0-9]', '', s.lower())
def money(s): return pd.to_numeric(s.str.replace(r'[\$,]', '', regex=True).str.replace(r'^\((.*)\)$', r'-\1', regex=True), errors='coerce')

# ---------------- geography helpers (ZIP -> county / lat-lon via the `zipcodes` package) ----------------
ZIPS = {}
try:
    import zipcodes
    for z in zipcodes.list_all():
        ZIPS[z['zip_code']] = (z.get('county') or '', z.get('state') or '', float(z['lat']) if z.get('lat') else None, float(z['long']) if z.get('long') else None)
except Exception as e:
    print('zipcodes package unavailable, county/metro will be blank:', e)
METROS = [  # name, lat, lon, radius km
    ('Atlanta metro', 33.749, -84.388, 60), ('Washington DC area', 38.907, -77.037, 45), ('New York City area', 40.713, -74.006, 45),
    ('Los Angeles area', 34.052, -118.244, 55), ('San Francisco Bay Area', 37.775, -122.419, 60), ('Chicago area', 41.878, -87.630, 50),
    ('Houston area', 29.760, -95.370, 50), ('Dallas–Fort Worth', 32.777, -96.797, 55), ('Miami–Fort Lauderdale', 26.122, -80.137, 55),
    ('Philadelphia area', 39.953, -75.165, 40), ('Boston area', 42.360, -71.059, 40), ('Charlotte area', 35.227, -80.843, 40),
    ('Nashville area', 36.163, -86.782, 40), ('Birmingham area', 33.519, -86.810, 35), ('Jacksonville area', 30.332, -81.656, 40),
    ('Tampa Bay', 27.951, -82.457, 45), ('Orlando area', 28.538, -81.379, 40), ('Seattle area', 47.606, -122.332, 40),
    ('Denver area', 39.739, -104.990, 40), ('Phoenix area', 33.448, -112.074, 45), ('Detroit area', 42.331, -83.046, 40),
    ('Minneapolis–St. Paul', 44.978, -93.265, 40), ('Columbus OH area', 39.961, -82.999, 35), ('Raleigh–Durham', 35.780, -78.639, 40),
    ('Savannah area', 32.081, -81.091, 35), ('Augusta area', 33.471, -81.975, 35), ('Columbus GA area', 32.461, -84.988, 30),
    ('Macon area', 32.841, -83.632, 30), ('Athens area', 33.951, -83.358, 25),
]
def haversine(lat1, lon1, lat2, lon2):
    p = math.pi / 180; a = 0.5 - math.cos((lat2 - lat1) * p) / 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lon2 - lon1) * p)) / 2
    return 12742 * math.asin(math.sqrt(a))
_metro_cache = {}
def metro_for(zip5):
    if zip5 in _metro_cache: return _metro_cache[zip5]
    z = ZIPS.get(zip5); m = ''
    if z and z[2] is not None:
        best = None
        for name, la, lo, r in METROS:
            d = haversine(z[2], z[3], la, lo)
            if d <= r and (best is None or d < best[0]): best = (d, name)
        m = best[1] if best else ''
    _metro_cache[zip5] = m; return m
def county_for(zip5):
    z = ZIPS.get(zip5)
    if not z or z[1] != 'GA': return ''
    return re.sub(r'\s+County$', '', z[0])

# ---------------- sector classification (occupation + employer keywords) ----------------
SECTORS = [
    ('Retired / not employed', r'\b(retired|not employed|unemployed|homemaker|house ?wife|student|disabled|n/?a|none)\b', 'occ'),
    ('Legal', r'\b(attorney|lawyer|law firm|legal|paralegal|judge|counsel|esq|llp)\b', 'both'),
    ('Healthcare', r'\b(physician|doctor|md\b|nurse|rn\b|dentist|dental|pharmac|hospital|health|medical|clinic|surgeon|therapist|psycholog|psychiatr|veterinar|optometr|chiropract|hospice|kaiser|piedmont|emory healthcare|wellstar|grady|northside hospital|cdc\b)', 'both'),
    ('Real estate & construction', r'\b(real estate|realtor|broker|property|properties|developer|development|construction|contractor|builder|architect|home ?builder|mortgage|title)\b', 'both'),
    ('Finance & insurance', r'\b(bank|banker|financ|invest|capital|equity|hedge|wealth|asset|insurance|cpa|accountant|accounting|portfolio|trader|venture|private equity|credit union|fund)\b', 'both'),
    ('Technology', r'\b(software|engineer|tech|technology|data|it\b|developer|programmer|google|microsoft|amazon|apple|meta|salesforce|oracle|cisco|ibm|intel|netflix|nvidia|startup|product manager|ux|cybersecurity|cloud)\b', 'both'),
    ('Education', r'\b(teacher|professor|educator|education|school|university|college|academic|faculty|principal|librarian|dean|instructor|tutor|emory university|georgia tech|georgia state|uga\b|spelman|morehouse|clark atlanta|kennesaw)\b', 'both'),
    ('Government & public sector', r'\b(government|county|city of|state of|federal|public|municipal|civil servant|legislat|senator|representative|commissioner|mayor|agency|department of|dept|military|army|navy|air force|veteran|postal|usps|police|fire ?fighter|sheriff)\b', 'both'),
    ('Nonprofit & advocacy', r'\b(non-?profit|foundation|charity|charitable|advocacy|organizer|community|ngo|church|pastor|minister|clergy|ministry|faith|rabbi|philanthrop)\b', 'both'),
    ('Media, arts & entertainment', r'\b(media|journalist|writer|author|editor|film|television|tv\b|music|musician|artist|actor|actress|producer|entertain|design|photograph|publishing|creative|studio)\b', 'both'),
    ('Consulting & professional services', r'\b(consult|advisor|adviser|strategist|strategy|public relations|pr\b|marketing|advertis|communications|lobby|government affairs|recruit|hr\b|human resources)\b', 'both'),
    ('Business owner & executive', r'\b(ceo|cfo|coo|president|founder|owner|executive|entrepreneur|business owner|managing director|vice president|vp\b|chairman|principal|partner)\b', 'both'),
    ('Sales, retail & hospitality', r'\b(sales|retail|restaurant|hospitality|hotel|chef|server|bartender|store|merchant|cashier|barber|salon|stylist|cosmetolog|customer service)\b', 'both'),
    ('Transportation & logistics', r'\b(driver|truck|logistics|transport|airline|pilot|delta|ups\b|fedex|railroad|shipping|aviation|uber|lyft)\b', 'both'),
    ('Manufacturing, energy & agriculture', r'\b(manufactur|factory|plant|energy|oil|gas|utility|utilities|georgia power|southern company|farmer|farm|agricultur|poultry|timber|mining|industrial|chemical|automotive|kia|hyundai)\b', 'both'),
    ('Self-employed', r'\b(self|self-employed|self employed|freelance|independent contractor|sole proprietor)\b', 'both'),
]
SECTOR_RX = [(name, re.compile(rx, re.I), scope) for name, rx, scope in SECTORS]
_sector_cache = {}
def sector_for(occ, emp):
    key = (occ, emp)
    if key in _sector_cache: return _sector_cache[key]
    o, e = occ.lower(), emp.lower()
    res = ''
    if not o and not e: res = 'Not reported'
    else:
        for name, rx, scope in SECTOR_RX:
            if scope == 'occ' and rx.search(o): res = name; break
            if scope == 'both' and (rx.search(o) or rx.search(e)): res = name; break
        if not res: res = 'Other / unclassified'
    _sector_cache[key] = res; return res

# ---------------- contributions ----------------
df = pd.read_csv(os.path.join(RAW, 'governor_field_contributions.csv'), dtype=str, keep_default_na=False, on_bad_lines='skip', encoding_errors='replace')
df.columns = [c.strip() for c in df.columns]
for c in df.columns: df[c] = df[c].fillna('')
df = df[pd.to_numeric(df['Filing Entity ID'], errors='coerce').notna()]
df['Filing Entity ID'] = df['Filing Entity ID'].astype(int)
df = df[df['Filing Entity ID'].isin(CANDS)].copy()
df['amt'] = money(df['Transaction Amount'])
df = df[df['amt'].notna()].copy()
df['zip5'] = df['Contributor Address Zip Code'].str.replace(r'^="?|"?$', '', regex=True).str.strip().str[:5]
df['day'] = df['Transaction Date'].map(days)
df['repday'] = df['Report Filed Date'].map(lambda s: days(s) if s else -1)
TXT = ['Contributor Last Name', 'Contributor First Name', 'Contributor Middle Name', 'Contributor Address City', 'Contributor Address State',
       'Contributor/Person Responsible for Loan Occupation', 'Contributor/Person Responsible for Loan Employer', 'Contributor Address Line 1',
       'Transaction Description', 'Disclosure Report Name', 'Timed Report Name']
for c in TXT: df[c] = df[c].map(clean)

api = []
for f in ENRICH:
    if os.path.exists(f): api += json.load(gzip.open(f))
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
    if not a.get('timed') or days(a['d']) < (NOW.date() - EPOCH).days - 45: continue
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
df['cents'] = (df['amt'] * 100).round().astype('int64')
df['name'] = [f"{l}, {f}{(' ' + m) if m else ''}".strip() if (f or m) else l for l, f, m in zip(df['Contributor Last Name'], df['Contributor First Name'], df['Contributor Middle Name'])]
df['dkey'] = [(norm(l) + '|' + norm(f)[:6] + '|' + z) if f else (norm(l) + '|' + z) for l, f, z in zip(df['Contributor Last Name'], df['Contributor First Name'], df['zip5'])]
df['nkey'] = [(norm(l) + '|' + norm(f)[:6]) if f else norm(l) for l, f in zip(df['Contributor Last Name'], df['Contributor First Name'])]  # name-only key (address-independent)
df['report'] = [t if t else d for t, d in zip(df['Timed Report Name'], df['Disclosure Report Name'])]
df['county'] = df['zip5'].map(county_for)
df['metro'] = df['zip5'].map(metro_for)
df['sector'] = [sector_for(o, e) for o, e in zip(df['Contributor/Person Responsible for Loan Occupation'], df['Contributor/Person Responsible for Loan Employer'])]

# ---------------- expenditures ----------------
ex = pd.read_csv(os.path.join(RAW, 'governor_field_expenditures.csv'), dtype=str, keep_default_na=False, on_bad_lines='skip', encoding_errors='replace')
ex.columns = [c.strip() for c in ex.columns]
for c in ex.columns: ex[c] = ex[c].fillna('')
ex = ex[pd.to_numeric(ex['Filing Entity Id'], errors='coerce').notna()].copy()
ex['Filing Entity Id'] = ex['Filing Entity Id'].astype(int)
ex = ex[ex['Filing Entity Id'].isin(CANDS)].copy()
ex['amt'] = money(ex['Transaction Amount'])
ex['eamt'] = money(ex['End Recipient Transaction Amount'])
ex['child'] = ex['amt'].isna() & ex['eamt'].notna()
ex = ex[ex['amt'].notna() | ex['eamt'].notna()].copy()
ex['val'] = ex['amt'].where(ex['amt'].notna(), ex['eamt'])
ex['day'] = ex['Transaction Date'].map(lambda s: days(s) if s else 0)
ex['repday'] = ex['Report Filed Date'].map(lambda s: days(s) if s else -1)
for c in ['Payee Last Name', 'Payee First Name', 'Payee Middle Name', 'Payee Address City', 'Payee Address State', 'Purpose', 'Transaction Description',
          'End Recipient Last Name', 'End Recipient First Name', 'End Recipient City', 'End Recipient State', 'End Recipient Transaction Description', 'Report Name', 'Timed Report Name', 'Payee Type']:
    ex[c] = ex[c].map(clean)
def payee_name(r):
    if r['child']:
        l, f = r['End Recipient Last Name'], r['End Recipient First Name']
    else:
        l, f = r['Payee Last Name'], r['Payee First Name']
    return f"{l}, {f}".strip(', ') if f else l
ex['payee'] = ex.apply(payee_name, axis=1)
ex['pcity'] = [ (rc if ch else pc) for ch, rc, pc in zip(ex['child'], ex['End Recipient City'], ex['Payee Address City'])]
ex['pstate'] = [ (rs if ch else ps).upper() for ch, rs, ps in zip(ex['child'], ex['End Recipient State'], ex['Payee Address State'])]
ex['desc'] = [ (rd if ch and rd else d) for ch, rd, d in zip(ex['child'], ex['End Recipient Transaction Description'], ex['Transaction Description'])]
ex['report'] = [t if t else d for t, d in zip(ex['Timed Report Name'], ex['Report Name'])]
ex['via'] = [ (p if ch else '') for ch, p in zip(ex['child'], ex['Payee Last Name'])]  # card / reimbursee the child was paid through
# spend category: the committee's Purpose when it is specific, otherwise derived from the description
CATS = [
    ('Advertising & media', r'advertis|media|\btv\b|television|cable|digital|radio|video|production|ad buy|placement|billboard|streaming|commercial|mailer|direct mail|print(ing)? (ads?|mail)'),
    ('Payment processing fees', r'proces|merchant|actblue|anedot|stripe|winred|bank fee|service fee|card fee|transaction fee'),
    ('Payroll & staff', r'payroll|salar|wage|stipend|staff|benefit|health ins|gusto|adp\b|401'),
    ('Consultants & strategy', r'consult|strateg|advis|general consulting|management'),
    ('Polling & research', r'poll|survey|research|focus group|analytics|data'),
    ('Fundraising', r'fundrais|donor|finance (director|consult)|call time|acquisition|list rental|prospect'),
    ('Field & voter contact', r'canvass|field|voter|text(ing)?|phone bank|organiz|yard sign|signs?\b|door|gotv|turnout|petition|literature'),
    ('Legal, compliance & accounting', r'legal|attorney|law\b|compliance|account|bookkeep|audit|cpa\b|treasurer'),
    ('Travel, lodging & meals', r'travel|hotel|airfare|flight|lodging|uber|lyft|mileage|meal|food|catering|restaurant|parking|rental car|gas\b|fuel'),
    ('Events & venues', r'event|venue|rental|rally|reception|ticket|sponsorship|table|gala|dinner|luncheon|conference'),
    ('Office, technology & supplies', r'software|phone|internet|office|supplies|subscription|website|hosting|zoom|domain|computer|equipment|postage|shipping|printing|print\b|design|insurance|rent\b|utilities'),
    ('Contributions & transfers', r'contribution|donation|transfer|dues|membership|party'),
    ('Refunds', r'refund|return'),
    ('Loan repayment', r'loan'),
]
CAT_RX = [(n, re.compile(rx, re.I)) for n, rx in CATS]
PURPOSE_MAP = {'T.V. or Cable Advertising/ Production Cost': 'Advertising & media', 'Radio Advertisements': 'Advertising & media', 'Campaign Literature': 'Field & voter contact',
               'Campaign Paraphernalia': 'Field & voter contact', 'Phone Bank': 'Field & voter contact', 'Petition Circulating': 'Field & voter contact', 'Member Communications': 'Advertising & media',
               'Campaign Staff Salaries': 'Payroll & staff', 'Campaign Consultants': 'Consultants & strategy', 'Polling and Survey Research': 'Polling & research',
               'Travel, Lodging, Meals': 'Travel, lodging & meals', 'Meet and Greet Appearances': 'Events & venues', 'Office Expenses': 'Office, technology & supplies',
               'Information Technology Cost': 'Office, technology & supplies', 'Print Services': 'Office, technology & supplies', 'Postage': 'Office, technology & supplies',
               'Returned Contributions': 'Refunds', 'Contribution': 'Contributions & transfers', 'Donation': 'Contributions & transfers', 'Civic Donation': 'Contributions & transfers',
               'Candidate Filing/Ballot Fees': 'Legal, compliance & accounting', 'Legal Defense': 'Legal, compliance & accounting', 'Loan': 'Loan repayment',
               'Anonymous- To be returned to the State Treasury': 'Refunds'}
PAYEE_RX = [('Coordinated campaign & party', re.compile(r'battleground|democratic party|republican party|\bgop\b|coordinated|victory fund|state party', re.I)),
            ('Payment processing fees', re.compile(r'actblue|anedot|stripe|winred|paypal|square', re.I)),
            ('Payroll & staff', re.compile(r'gusto|\badp\b|paychex|payroll', re.I)),
            ('Advertising & media', re.compile(r'media|digital|advertis|broadcast|creative|films?\b|video|production', re.I)),
            ('Legal, compliance & accounting', re.compile(r'\blaw\b|legal|compliance|\bcpa\b|accounting', re.I)),
            ('Polling & research', re.compile(r'research|poll|analytics|insights', re.I)),
            ('Consultants & strategy', re.compile(r'strateg|consult|partners|group\b|advisors', re.I)),
            ('Travel, lodging & meals', re.compile(r'hotel|marriott|hilton|hyatt|airlines|delta|uber|lyft|inn\b|resort|restaurant|cafe|catering', re.I))]
def spend_cat(purpose, desc, ttype, payee):
    if ttype == 'Return Expenditure': return 'Refunds'
    if purpose in PURPOSE_MAP: return PURPOSE_MAP[purpose]
    for n, rx in CAT_RX:
        if rx.search(desc or ''): return n
    for n, rx in PAYEE_RX:
        if rx.search(payee or ''): return n
    return 'Other / not categorized'
ex['cat'] = [spend_cat(p, d, t, py) for p, d, t, py in zip(ex['Purpose'], ex['desc'], ex['Transaction Type'], ex['payee'])]

class Dict:
    def __init__(self): self.m = {}; self.v = []
    def idx(self, s):
        if s not in self.m: self.m[s] = len(self.v); self.v.append(s)
        return self.m[s]

def build(sub, exsub):
    dicts = {k: Dict() for k in ['name', 'ctype', 'sub', 'ttype', 'etype', 'city', 'state', 'zip', 'occ', 'emp', 'report', 'addr', 'desc', 'dkey', 'nkey', 'eyear', 'county', 'metro', 'sector',
                                 'payee', 'ptype', 'purpose', 'cat', 'xsub', 'xttype', 'xdesc', 'pcity', 'pstate', 'xreport', 'via']}
    for d in dicts.values(): d.idx('')
    unit_mask = sub['Transaction Sub Type'].eq('Unitemized Contribution')
    det, unit = sub[~unit_mask], sub[unit_mask]
    cols = {k: [] for k in ['tid', 'day', 'cents', 'name', 'dkey', 'nkey', 'ctype', 'sub', 'ttype', 'etype', 'eyear', 'city', 'state', 'zip', 'occ', 'emp', 'report', 'addr', 'desc', 'amended', 'repday', 'county', 'metro', 'sector']}
    for r in det.to_dict('records'):
        cols['tid'].append(int(r['Transaction Id'])); cols['day'].append(int(r['day'])); cols['cents'].append(int(r['cents'])); cols['repday'].append(int(r['repday']))
        cols['name'].append(dicts['name'].idx(r['name'])); cols['dkey'].append(dicts['dkey'].idx(r['dkey'])); cols['nkey'].append(dicts['nkey'].idx(r['nkey']))
        cols['ctype'].append(dicts['ctype'].idx(r['Contributor Type'])); cols['sub'].append(dicts['sub'].idx(r['Transaction Sub Type'] or r['Transaction Type']))
        cols['ttype'].append(dicts['ttype'].idx(r['Transaction Type'])); cols['etype'].append(dicts['etype'].idx(r['Election Type'])); cols['eyear'].append(dicts['eyear'].idx(r['Election Year']))
        c = r['Contributor Address City']; cols['city'].append(dicts['city'].idx(c.title() if c.isupper() else c))
        cols['state'].append(dicts['state'].idx(r['Contributor Address State'].upper())); cols['zip'].append(dicts['zip'].idx(r['zip5']))
        cols['occ'].append(dicts['occ'].idx(r['Contributor/Person Responsible for Loan Occupation'])); cols['emp'].append(dicts['emp'].idx(r['Contributor/Person Responsible for Loan Employer']))
        cols['report'].append(dicts['report'].idx(r['report'])); cols['addr'].append(dicts['addr'].idx(r['Contributor Address Line 1'])); cols['desc'].append(dicts['desc'].idx(r['Transaction Description']))
        cols['amended'].append(1 if r['Amended'] == 'Y' else 0)
        cols['county'].append(dicts['county'].idx(r['county'])); cols['metro'].append(dicts['metro'].idx(r['metro'])); cols['sector'].append(dicts['sector'].idx(r['sector']))
    ucols = {k: [] for k in ['day', 'cents', 'etype', 'ttype', 'report', 'repday']}
    for r in unit.to_dict('records'):
        ucols['day'].append(int(r['day'])); ucols['cents'].append(int(r['cents'])); ucols['repday'].append(int(r['repday']))
        ucols['etype'].append(dicts['etype'].idx(r['Election Type'])); ucols['ttype'].append(dicts['ttype'].idx(r['Transaction Type'])); ucols['report'].append(dicts['report'].idx(r['report']))
    xcols = {k: [] for k in ['tid', 'child', 'day', 'cents', 'payee', 'ptype', 'purpose', 'cat', 'xsub', 'xttype', 'xdesc', 'pcity', 'pstate', 'etype', 'xreport', 'repday', 'via']}
    for r in exsub.to_dict('records'):
        xcols['tid'].append(int(r['Transaction ID'])); xcols['child'].append(1 if r['child'] else 0); xcols['day'].append(int(r['day'])); xcols['cents'].append(int(round(r['val'] * 100)))
        xcols['payee'].append(dicts['payee'].idx(r['payee'])); xcols['ptype'].append(dicts['ptype'].idx(r['Payee Type'])); xcols['purpose'].append(dicts['purpose'].idx(r['Purpose'])); xcols['cat'].append(dicts['cat'].idx(r['cat']))
        xcols['xsub'].append(dicts['xsub'].idx(r['Transaction Sub Type'])); xcols['xttype'].append(dicts['xttype'].idx(r['Transaction Type'])); xcols['xdesc'].append(dicts['xdesc'].idx(r['desc']))
        xcols['pcity'].append(dicts['pcity'].idx(r['pcity'])); xcols['pstate'].append(dicts['pstate'].idx(r['pstate'])); xcols['etype'].append(dicts['etype'].idx(r['Election Type']))
        xcols['xreport'].append(dicts['xreport'].idx(r['report'])); xcols['repday'].append(int(r['repday'])); xcols['via'].append(dicts['via'].idx(r['via']))
    return {k: d.v for k, d in dicts.items()}, cols, ucols, xcols, len(det), len(unit)

registry = {}
try:
    for r in json.load(open(os.path.join(RAW, 'registry.json')))['candidates']: registry[int(r['id'])] = r
except Exception as e:
    print('registry unavailable:', e)

field = []
cross = collections.defaultdict(lambda: {'gifts': {}, 'n': {}})
cross_meta = {}
for fid, meta in CANDS.items():
    sub = df[df['Filing Entity ID'] == fid]
    if not len(sub): continue
    exsub = ex[ex['Filing Entity Id'] == fid]
    committee = sub['Filing Entity Name'].mode().iloc[0]
    dicts, cols, ucols, xcols, nd, nu = build(sub, exsub)
    con = sub[sub['Transaction Type'] == 'Contribution']; ret = sub[sub['Transaction Type'] == 'Return Contribution']
    loans = sub[sub['Transaction Type'].str.startswith('Loan')]
    lo = loans.drop_duplicates(['Transaction Type', 'Transaction Date', 'cents', 'Transaction Description'])
    gross = con['amt'].sum(); unit = con[con['Transaction Sub Type'] == 'Unitemized Contribution']['amt'].sum()
    inkind = con[con['Transaction Sub Type'] == 'In-Kind Contribution']['amt'].sum()
    ind = con[(con['Transaction Sub Type'] != 'Unitemized Contribution')]
    ga = ind[ind['Contributor Address State'].str.upper() == 'GA']['amt'].sum(); ind_tot = ind['amt'].sum()
    self_fund = con[con['Contributor Type'].isin(['Self', 'Candidate / Candidate Committee'])]['amt'].sum()
    last = meta['cand'].split()[-1].lower()
    own = con[(con['Contributor Type'] == 'Individual') & (con['Contributor Last Name'].str.lower().str.contains(last)) & (con['Contributor First Name'].str.lower().str.startswith(meta['cand'].split()[0].lower()[:3]))]['amt'].sum()
    monthly = {}
    for d, a in zip(con['day'], con['amt']):
        t = EPOCH + dt.timedelta(days=int(d)); k = t.year * 12 + t.month - 1; monthly[k] = monthly.get(k, 0) + a
    # spending (parent rows only; returns reduce)
    parents = exsub[~exsub['child']]
    spent = parents[parents['Transaction Type'] == 'Expenditure']['val'].sum(); xret = parents[parents['Transaction Type'] == 'Return Expenditure']['val'].sum()
    mspend = {}
    for d, a, t in zip(parents['day'], parents['val'], parents['Transaction Type']):
        tt = EPOCH + dt.timedelta(days=int(d)); k = tt.year * 12 + tt.month - 1; mspend[k] = mspend.get(k, 0) + (a if t == 'Expenditure' else -a)
    bands = [(0, 100), (100, 1000), (1000, 8400), (8400, 1e18)]
    bandsum = [float(con[(con['amt'] >= lo_) & (con['amt'] < hi_)]['amt'].sum()) for lo_, hi_ in bands]
    bandn = [int(((con['amt'] >= lo_) & (con['amt'] < hi_)).sum()) for lo_, hi_ in bands]
    donors = ind[ind['Contributor Type'] == 'Individual']['dkey'].nunique()
    reg = registry.get(fid, {})
    # cross-candidate index (itemized gifts, net of refunds, by donor key); leadership committees are compared separately
    for r in ([] if meta.get('kind') == 'leadership' else sub[sub['Transaction Sub Type'] != 'Unitemized Contribution'].to_dict('records')):
        if r['Transaction Type'] not in ('Contribution', 'Return Contribution'): continue
        k = r['dkey']; cross[k]['gifts'][fid] = round(cross[k]['gifts'].get(fid, 0) + r['amt'], 2); cross[k]['n'][fid] = cross[k]['n'].get(fid, 0) + 1
        if k not in cross_meta or (not cross_meta[k].get('emp') and r['Contributor/Person Responsible for Loan Employer']):
            cross_meta[k] = dict(name=r['name'], city=r['Contributor Address City'], state=r['Contributor Address State'].upper(), zip=r['zip5'], ctype=r['Contributor Type'],
                                 emp=r['Contributor/Person Responsible for Loan Employer'], occ=r['Contributor/Person Responsible for Loan Occupation'])
    meta_out = dict(id=fid, committee=committee, **meta, rows=int(len(sub)), detailRows=nd, unitemizedRows=nu, gross=round(gross, 2), refunds=round(ret['amt'].sum(), 2),
                    net=round(gross + ret['amt'].sum(), 2), unitemized=round(unit, 2), inkind=round(inkind, 2), itemized=round(gross - unit - inkind, 2),
                    gaShare=round(ga / ind_tot, 4) if ind_tot else None, donors=int(donors), contributions=int(len(con)),
                    selfFunding=round(self_fund + own, 2), loansReceived=round(lo[lo['Transaction Type'] == 'Loan Received']['amt'].sum(), 2),
                    loansRepaid=round(lo[lo['Transaction Type'] == 'Loan Payment']['amt'].sum(), 2),
                    firstDay=int(sub['day'].min()), lastDay=int(sub['day'].max()), monthly={str(k): round(v, 2) for k, v in sorted(monthly.items())},
                    bands=dict(labels=['< $100', '$100–999', '$1,000–8,399', '$8,400+'], sums=[round(x, 2) for x in bandsum], counts=bandn),
                    apiRowsAdded=int(added.get(fid, 0)), avgGift=round(gross / len(con), 2) if len(con) else 0,
                    medianGift=float(con['amt'].median()) if len(con) else 0,
                    spent=round(spent - xret, 2), spendRows=int(len(exsub)), monthlySpend={str(k): round(v, 2) for k, v in sorted(mspend.items())},
                    lastSpendDay=int(parents['day'].max()) if len(parents) else None,
                    registryRaised=reg.get('raised'), registrySpent=reg.get('spent'), cashOnHand=reg.get('cashOnHand'))
    field.append(meta_out)
    out = {'meta': dict(meta_out, filer=committee, candidate=meta['cand'], filerEntityId=fid, epoch=EPOCH.isoformat(), limits=LIMITS,
                        source='Georgia Government Transparency & Campaign Finance Commission (PeachFile) bulk Contribution and Expenditure files, filing years 2025 + 2026',
                        extractedAsOf=EXTRACTED, apiPulledAt=PULLED),
           'dict': dicts, 'det': cols, 'unit': ucols, 'exp': xcols}
    with open(os.path.join(OUT, f'cand-{fid}.json'), 'w') as f: json.dump(out, f, separators=(',', ':'))
    print(fid, committee, 'rows', len(sub), 'net', round(gross + ret['amt'].sum()), 'spent', round(spent - xret), 'exp rows', len(exsub), 'added', added.get(fid, 0), 'kb', os.path.getsize(os.path.join(OUT, f'cand-{fid}.json')) // 1024)

field.sort(key=lambda x: -x['net'])
json.dump({'generated': NOW.isoformat(), 'extractedAsOf': EXTRACTED, 'apiPulledAt': PULLED, 'epoch': EPOCH.isoformat(), 'limits': LIMITS,
           'elections': {'Primary': '2026-05-19', 'Primary Runoff': '2026-06-16', 'General': '2026-11-03'},
           'candidates': field}, open(os.path.join(OUT, 'field.json'), 'w'), separators=(',', ':'))
# shared donors: gave to 2+ committees
shared = []
for k, v in cross.items():
    if len(v['gifts']) < 2: continue
    m = cross_meta[k]
    shared.append(dict(k=k, **m, gifts=v['gifts'], n=v['n'], total=round(sum(v['gifts'].values()), 2)))
shared.sort(key=lambda x: -x['total'])
json.dump({'generated': NOW.isoformat(), 'donors': shared}, open(os.path.join(OUT, 'cross.json'), 'w'), separators=(',', ':'))
print('field.json', len(field), 'candidates;', 'cross.json', len(shared), 'shared donors')
