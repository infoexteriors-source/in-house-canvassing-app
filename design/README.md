# UI mockups

Design prototype for the WE ROOF owner dashboard (desktop) and the canvasser field app (iPhone/Android, 390×844). It follows the brand in `DESIGN.md`: charcoal navigation, roofing red for primary actions, warm light surfaces for outdoor contrast, and the outcome colors from `packages/core`, each paired with a text label.

Each screen is a self-contained `.dc.html` file in `mockups/project/`. `canvas.json` sets out the screens. They are reference designs and are not wired into `apps/`.

| Screen | File | Interactive |
| --- | --- | --- |
| Owner · Overview | `Main.dc.html` | links to Leads |
| Owner · Leads & CRM delivery | `Leads.dc.html` | filter tabs, select a lead, reconciliation state |
| Rep · Sign in | `Login.dc.html` | → Map |
| Rep · Territory map | `Field.dc.html` | Take/End break, tap house, Record door, tab bar |
| Rep · Record a door | `Record.dc.html` | pick an outcome; Follow-up shows dates; Interested/Inspection continues to the lead form |
| Rep · Do-not-knock warning | `DoNotKnock.dc.html` | must acknowledge before "Record anyway" |
| Rep · Homeowner & inspection | `Lead.dc.html` | inspection toggle, day and time window |
| Rep · Recorded doors | `Doors.dc.html` | Today / Follow-ups / All filters |
| Rep · My field hours | `Hours.dc.html` | correction request form |
| Rep · Offline & sync | `Sync.dc.html` | toggle between no-signal and back-online states |

All names, addresses and numbers are sample data.
