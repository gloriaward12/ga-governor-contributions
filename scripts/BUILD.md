# Rebuilding the finance data (run locally; exports never enter the repo)

python3 -I scripts/build_ngp.py <campaign ContributionReport.xlsx|pkl> <events.csv> <public/data/cand-100663.json or kfg_live.json> \
  --pbg-filed <cand-105433.json> --pbg <battleground ContributionReport pkl> --pbg-codes <SourceCodesReport pkl> \
  --pbg-participants <EventParticipantReport pkl> --pbg-guests <TicketedGuestReport pkl> --pbg-attributions <AttributionsSoftCreditsReport pkl>
python3 -I scripts/build_screens.py <campaign pkl> <cand-105433.json> <ga_vendor_payments.csv> <ga_lobbyists.csv> <appointments.json>

NGP .xls exports are UTF-16 tab-delimited: pd.read_csv(path, sep='\t', encoding='utf-16', dtype=str)
Confirmed hosts live in scripts/hosts_manual.json (code -> host, hostNames, name).

Narrow Battleground exports (13 columns, no Home/Employer fields): merge the Home City/State/ZIP, Employer, Occupation and
Total Adjusted Amount columns in from the last full-column export by VANID / Contribution ID before passing --pbg, or
name+ZIP matching against the Commission filing degrades to name-only. Ask for the full-column ContributionReport when possible.
