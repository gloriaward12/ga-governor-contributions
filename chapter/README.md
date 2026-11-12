# Chapter — Transition Intelligence (Georgia's Promise)

Static app. Data is built from public sources already fetched to disk:

    python3 -I build_data.py     # -> data/*.json (needs ../eo_2026.json, ../press_2026.json, /home/claude/boards/appointments.json)
    python3 -I make_pages.py     # -> *.html with a fresh cache stamp

Deploy as its own Vercel project with root directory `chapter`, framework "Other", no build command.
Sources: gov.georgia.gov (executive orders, press releases, appointment releases), Governor's Budget Report AFY2026/FY2027, DOR monthly revenue releases, Nov 6–12 2026 press coverage of the transition.
