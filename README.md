# EMBA Planner: Yale SOM EMBA Class of 2028

One place for every assignment, reading, case, and class session across all of our courses.
It's the combined view Canvas doesn't give us.

**Features**
- **List view** grouped by class weekend (everything due between one weekend and the next), with a "Today" marker
- **Calendar view**: short color-coded entries; hover for a preview, click for full details
- **By-course view** with grading breakdown and per-course progress
- Every deliverable shows **points (% of course grade)**, **group / individual**, and **required / optional**
- Readings and cases link straight to the Canvas file or case site
- **Checkboxes** gray out finished items; uncheck any time. Saved in *your* browser only.
- Category / course / requirement / group switches, plus **Show all** and **Clear output**
- **📅 Add to calendar**: one-tap subscribe in Apple, Google, or Outlook Calendar (a live feed that updates when a syllabus is published), or download a one-time .ics
- **📱 Install app**: add it to your phone or iPad home screen; works offline; layouts tuned for laptop, tablet, and phone
- **Ask the Planner** chat (bottom-right): built-in answers for "what's due this week", "readings for
  Nov 7", "who teaches Operations", "how is Competitor graded" (no key needed); optional **Claude**
  for any question in your own words, through a shared proxy (`worker/`) or your own API key
- Full **professor names** with Yale profile links on every class session and course

> Unofficial, student-built. Always confirm dates on Canvas. Items marked **⚠ verify** need a human check.

## Accounts, to-dos, and teams

- **Sign in** with your @yale.edu email; you get a 6-digit code by email and stay signed in for 90 days.
- **Your checkmarks and "My courses"** are saved to your account, so phone and laptop stay in sync.
- **Teams**: anyone can create a team and share its invite link. Members add weekly / every-other-week
  meetings (with skipped dates) or one-off meetings. Teams are private to their members.
- **Calendars**: every course, the program calendar, and each of your teams is its own subscription.
  The links are personal; reset them from the account menu if one leaks.

## Updating (maintainer only)

Sign in with the maintainer account and open **Manage courses** from the account menu (`/admin.html`).
Drop a syllabus PDF or paste a public course page; Claude extracts it, you review, and Publish makes it
live for everyone immediately. Every change can be undone there. On iPhone, the "Add to EMBA Planner"
Shortcut sends a PDF from Canvas's Share button straight to that page (setup steps are on the page).

Command line alternative, in Claude Code from this folder: `/add-syllabus syllabi/<file>.pdf`.

## How it's built

One Cloudflare Worker (`worker/`) serves the site (`public/`) and its API, with a D1 database for
accounts, course data (with undo history), checkmarks, and teams. See `CLAUDE.md` and `worker/README.md`.
`syllabi/` is git-ignored so school PDFs never get published.
