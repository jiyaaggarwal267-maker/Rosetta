# Rosetta frontend

Next.js 16 + Tailwind v4. Visual rules come from `design.md`. The app needs the backend in `../backend`.

## Run

```bash
# terminal 1
cd ../backend && npm install && npm run dev      # http://localhost:4000
# terminal 2
npm install && npm run dev                       # http://localhost:3000
```

`NEXT_PUBLIC_API_BASE` defaults to `http://localhost:4000`. Create a workspace, then press **Add a sample team** to see every role.

## Legal, consent and accessibility

- **Fill in the placeholders** in `src/lib/legal.ts` before launch: `LEGAL_ENTITY`, `ADDRESS`, `CONTACT_EMAIL`, `GRIEVANCE_OFFICER` (name, email), `JURISDICTION_CITY`, `EFFECTIVE_DATE`, `GRIEVANCE_RESPONSE`, `REFUND_WINDOW`. Bump `POLICY_VERSION` (and the backend's versions) when a policy changes: the storage banner asks again.
- Legal pages are templates, not legal advice: have a lawyer review them. Other `[bracketed]` notes for the team are inside the page texts.
- `src/lib/consent.ts`: the storage choice (`rosetta:consent`). Anything optional added later (analytics, embeds) must check `hasConsent("analytics" | "embeds")` before loading.
- `npm run licenses` regenerates `src/lib/licenses.json` (shown on `/licenses`) from both apps' `package.json`.
- `next.config.ts` sets a Content-Security-Policy allowing only this site and `NEXT_PUBLIC_API_BASE`, plus `Referrer-Policy: strict-origin-when-cross-origin`. Add any new origin there.

## Screens

| Route | Who | What |
| --- | --- | --- |
| `/` | everyone | What Rosetta is, the slider demo, the detailed flowchart with its worked example, how changes reach people, pricing |
| `/signup` · `/join` · `/login` · `/forgot` · `/reset` | | Create a workspace (CMO or manager) · join with an invite code · log in · reset a password by email |
| `/app` | by role | Engineer and intern: **My work** (their changes, questions for them). Manager: **Team activity** (team changes filtered by engineer, stats, engineers' latest comments, check in with anyone). CMO: **Overview** (teams, then changes filtered by team or person). Client: reviewed **Updates** |
| `/app/c/[id]` | can see it | One change at the reader's own level: confidence badge ("Checked against the code: High (92/100)"), story, engineers' comments, "How it works" flowchart with before/after and a step-through example. Selecting a box shows the code behind it and opens Ask Why; "This step looks wrong" reports it to the author. The author reviews it, previewing all six versions |
| `/app/digest` | leads, clients | **This week**: headline, what changed, what needs attention, who shipped what. Save as PDF. Leads also preview and send the **weekly report email** (per engineer, every flowchart, written for the owner) |
| `/app/updates` | leads | Every change engineers push and their comments (Rosetta and GitHub), newest first, by engineer, team or kind |
| `/app/questions` · `/app/questions/[id]` | everyone | Questions asked of me / by me; threads rewritten for each reader |
| `/app/team` | leads | People by team, add someone (invite code), watched repositories, sync, webhook setup, today's AI use; the owner renames the workspace and manages people |
| `/app/profile` | everyone | Name, title, GitHub username, focus, language (English or Hinglish), password, product emails, Download my data, Delete my account |
| `/privacy` · `/terms` · `/cookies` · `/refunds` · `/data` · `/contact` · `/licenses` | everyone | Legal pages, each with an "In plain words" summary; linked from every footer |

Every signed-in page has the notification bell. Feeds have search (in the reader's own words), date, risk and repository filters, and "Show more".

## Where things are

- `src/components/flowchart.tsx`: `FlowDiagram` (JSON → Mermaid with shapes, groups and edge labels; path highlighting) and `HowItWorks` (before/after + walkthrough)
- `src/components/dashboards.tsx`: the per-role homes; `feed.tsx`: feed cards, search and filters
- `src/components/confidence.tsx` · `evidence.tsx`: the verification badge and the code behind each step
- `src/components/notification-bell.tsx` · `digest.tsx`: the bell and the weekly page
- `src/lib/roles.ts`: roles, tabs per role
- `src/lib/api.ts`: every backend call; `src/lib/session.tsx`: login state
- `src/lib/mock/samples.ts`: the demo commits (shared with the backend), used on the landing page
